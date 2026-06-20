import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { audit, auditWrap } from "@/lib/audit";
import { getBillingProvider, getPlanConfig, hashCpf, resolveCheckoutCpf } from "@/lib/billing";
import { detectOwnerCpfReuse } from "@/lib/anti-fraud/owner-cpf-dedup";
import type { ApiResponse } from "@/lib/types/api";
import type { PlanTier } from "@/generated/prisma/client";

const bodySchema = z.object({
  plan: z.enum(["PRO", "PREMIUM"]),
  method: z.enum(["PIX", "CREDIT_CARD"]),
  /** Opcional: enviado pela UI quando a conta não tem CPF (grandfathered). */
  cpf: z.string().trim().optional(),
});

export type CheckoutResponse = {
  sessionId: string;
  qrCodeBase64: string | null;
  qrCodePayload: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  plan: PlanTier;
  method: "PIX" | "CREDIT_CARD";
  /** Provider real usado ("MOCK" | "ASAAS"). Em dev com sandbox, NODE_ENV
   * não diz qual provider está ativo — a UI gateia o atalho de simulação nisto. */
  provider: string;
};

export const POST = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return badRequestResponse(parsed.error.issues[0].message);
    }
    const { plan, method } = parsed.data;

    // Plano oculto da venda (ex: PREMIUM até as features existirem) não pode
    // ser assinado nem por URL direta.
    if (getPlanConfig(plan).hidden) {
      return badRequestResponse("Plano indisponível no momento");
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, cpf: true },
    });
    if (!user) return unauthorizedResponse();

    const sub = await prisma.subscription.findUnique({
      where: { userId: user.id },
    });

    if (sub?.plan === plan && sub.status === "ACTIVE") {
      return badRequestResponse("Você já está nesse plano");
    }

    // CPF é obrigatório no provider (Asaas rejeita a assinatura sem ele). Para
    // contas grandfathered (User.cpf null), a UI envia o CPF no body. Resolvido
    // ANTES de tocar o provider para não criar customer órfão sem CPF.
    const cpfResult = resolveCheckoutCpf({ userCpf: user.cpf, providedCpf: parsed.data.cpf });
    if (cpfResult.status === "required") {
      return NextResponse.json<ApiResponse>(
        { error: "CPF_REQUIRED", message: "Para assinar, precisamos do seu CPF." },
        { status: 400 },
      );
    }
    if (cpfResult.status === "invalid") {
      return badRequestResponse(cpfResult.message);
    }
    const cpf = cpfResult.canonical;

    // Persiste o CPF informado na conta (grandfathered preenchendo agora).
    // Este é o ÚNICO outro ponto além do register que grava `User.cpfHash`, então
    // aplica os MESMOS controles anti-fraude do register (senão o checkout vira
    // uma porta pra burlar a dedup cross-tenant de CPF do dono).
    if (cpfResult.persist) {
      const cpfHashValue = hashCpf(cpf);

      // Hard-block ao 5º compartilhamento do mesmo CPF (espelha register).
      const existingSameCpf = await prisma.user.count({ where: { cpfHash: cpfHashValue } });
      if (existingSameCpf >= 4) {
        await audit({
          action: "fraud.cpf_reused_owner",
          tenantUserId: user.id,
          metadata: { count: existingSameCpf, blocked: true, source: "checkout" },
        });
        return NextResponse.json<ApiResponse>(
          { error: "CPF_LIMIT", message: "Limite de contas com esse CPF atingido. Entre em contato com o suporte." },
          { status: 409 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { cpf, cpfHash: cpfHashValue },
      });
      await audit({
        action: "billing.checkout.cpf_added",
        tenantUserId: user.id,
        entityType: "User",
        entityId: user.id,
      });
      // Detecção cross-tenant + auto-suspend (>3), idêntica ao register.
      // Conta grandfathered é sempre antiga ⇒ nunca é "a mais nova" ⇒ o
      // auto-suspend recai em conta mais recente que compartilhe o CPF, não nesta.
      await detectOwnerCpfReuse(user.id, cpfHashValue);
    }

    const provider = getBillingProvider();

    // Cria customer (1ª vez) ou reusa providerCustomerId existente
    let customerId = sub?.providerCustomerId;
    if (!customerId) {
      const created = await provider.createCustomer({
        userId: user.id,
        email: user.email,
        name: user.name,
        cpf,
      });
      customerId = created.providerCustomerId;
    } else {
      // Customer já existe no gateway: sincroniza o CPF de forma IDEMPOTENTE em
      // todo checkout. Recupera o customer órfão criado sem CPF antes do fix
      // (POST /customers/{id} é idempotente) — não pode ficar preso a uma única
      // tentativa, senão uma falha de rede deixaria a assinatura travada no 400.
      await provider.updateCustomer({ providerCustomerId: customerId, cpf });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const checkout = await provider.createCheckout({
      userId: user.id,
      customerId,
      plan,
      method,
      returnUrl: `${appUrl}/billing/sucesso`,
    });

    // Persiste/atualiza Subscription com providerCustomerId + providerSubscriptionId
    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        providerCustomerId: customerId,
        providerSubscriptionId: checkout.sessionId,
        provider: provider.name,
        // Não muda status aqui — só após webhook PAYMENT_RECEIVED
      },
      create: {
        userId: user.id,
        plan: "FREE",
        status: "ACTIVE",
        provider: provider.name,
        providerCustomerId: customerId,
        providerSubscriptionId: checkout.sessionId,
      },
    });

    await audit({
      action: "billing.checkout.created",
      tenantUserId: user.id,
      entityType: "Subscription",
      entityId: sub?.id ?? null,
      metadata: {
        plan,
        method,
        sessionId: checkout.sessionId,
        provider: provider.name,
      },
    });

    return NextResponse.json<ApiResponse<CheckoutResponse>>({
      data: {
        sessionId: checkout.sessionId,
        qrCodeBase64: checkout.qrCodeBase64 ?? null,
        qrCodePayload: checkout.qrCodePayload ?? null,
        paymentUrl: checkout.paymentUrl ?? null,
        expiresAt: checkout.expiresAt?.toISOString() ?? null,
        plan,
        method,
        provider: provider.name,
      },
    });
  } catch (error) {
    console.error("checkout error:", error);
    return serverErrorResponse();
  }
});
