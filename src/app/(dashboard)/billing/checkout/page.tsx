"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PLAN_LABELS, formatBRL } from "@/components/billing/plan-meta";
import { PLANS } from "@/lib/billing/plans";
import { formatCpf } from "@/lib/anti-fraud/cpf-validator";
import { useSubscription } from "@/hooks/use-api";

type CheckoutResponse = {
  sessionId: string;
  qrCodeBase64: string | null;
  qrCodePayload: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  plan: "PRO" | "PREMIUM";
  method: "PIX" | "CREDIT_CARD";
  provider: string;
};

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const planParam = (params.get("plan") ?? "PRO").toUpperCase() as "PRO" | "PREMIUM";
  const [method, setMethod] = React.useState<"PIX" | "CREDIT_CARD">("PIX");
  const [checkout, setCheckout] = React.useState<CheckoutResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [polling, setPolling] = React.useState(false);
  // Conta grandfathered (sem CPF): backend responde CPF_REQUIRED → pedimos o campo.
  const [cpfRequired, setCpfRequired] = React.useState(false);
  const [cpf, setCpf] = React.useState("");

  const subQuery = useSubscription();

  const startCheckout = React.useCallback(
    async (m: "PIX" | "CREDIT_CARD", cpfValue?: string) => {
      setLoading(true);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: planParam,
            method: m,
            ...(cpfValue ? { cpf: cpfValue } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json?.error === "CPF_REQUIRED") {
            setCpfRequired(true);
            return;
          }
          // CPF informado mas inválido/bloqueado: mantém o campo aberto + mostra
          // a mensagem PT (prefere `message`; cai pra `error` p/ erros legados).
          toast.error(json?.message || json?.error || "Erro ao criar checkout");
          return;
        }
        setCheckout(json.data);
        setPolling(true);
      } catch (e) {
        toast.error("Erro de rede");
      } finally {
        setLoading(false);
      }
    },
    [planParam],
  );

  const cpfDigits = cpf.replace(/\D/g, "");

  // Poll status — quando subscription vira o plano-alvo ACTIVE, redireciona pra /sucesso.
  React.useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => {
      subQuery.refetch();
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, subQuery]);

  React.useEffect(() => {
    if (!polling || !subQuery.data) return;
    if (subQuery.data.plan === planParam && subQuery.data.status === "ACTIVE") {
      setPolling(false);
      router.push("/billing/sucesso");
    }
  }, [polling, subQuery.data, planParam, router]);

  // Mock-only: trigger fake payment
  const triggerMockPayment = async () => {
    const r = await fetch("/api/billing/mock-trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "PAYMENT_RECEIVED", plan: planParam }),
    });
    const j = await r.json();
    if (j.ok) {
      toast.success("Pagamento simulado processado");
      subQuery.refetch();
    } else {
      toast.error("Falha ao simular pagamento");
    }
  };

  const plan = PLANS[planParam];
  // Atalho de simulação só quando o checkout veio do MockProvider. Em dev com
  // BILLING_PROVIDER=ASAAS (sandbox), o mock-trigger falharia no HMAC — o
  // pagamento sandbox se confirma pelo painel/API do Asaas.
  const isMock = checkout?.provider === "MOCK";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/billing"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Assinar plano {PLAN_LABELS[planParam]}</CardTitle>
          <CardDescription>
            {formatBRL(plan.priceMonthly)}/mês · cobrança recorrente · cancelamento a qualquer momento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!checkout && cpfRequired && (
            <div className="space-y-2" data-testid="checkout-cpf-block">
              <Label htmlFor="checkout-cpf">Informe seu CPF para continuar</Label>
              <Input
                id="checkout-cpf"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  setCpf(digits.length === 11 ? formatCpf(digits) : digits);
                }}
                disabled={loading}
                data-testid="checkout-cpf-input"
              />
              <p className="text-xs text-muted-foreground">
                Necessário para emitir a cobrança. Não é compartilhado.
              </p>
              <Button
                className="w-full"
                onClick={() => startCheckout(method, cpf)}
                disabled={loading || cpfDigits.length !== 11}
                data-testid="checkout-cpf-submit"
              >
                {loading ? "Gerando..." : "Continuar"}
              </Button>
            </div>
          )}

          {!checkout && !cpfRequired && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={method === "PIX" ? "default" : "outline"}
                  onClick={() => setMethod("PIX")}
                  disabled={loading}
                >
                  Pix
                </Button>
                <Button
                  variant={method === "CREDIT_CARD" ? "default" : "outline"}
                  onClick={() => setMethod("CREDIT_CARD")}
                  disabled={loading}
                >
                  Cartão de crédito
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={() => startCheckout(method)}
                disabled={loading}
                data-testid="checkout-start"
              >
                {loading ? "Gerando..." : `Continuar com ${method === "PIX" ? "Pix" : "cartão"}`}
              </Button>
            </>
          )}

          {checkout && checkout.method === "PIX" && checkout.qrCodeBase64 && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold">Escaneie o QR code Pix</p>
              <img
                src={`data:image/png;base64,${checkout.qrCodeBase64}`}
                alt="QR code Pix"
                className="mx-auto h-64 w-64 rounded border bg-white p-3"
                data-testid="checkout-qr"
              />
              {checkout.qrCodePayload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(checkout.qrCodePayload!);
                    toast.success("Código copiado");
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copiar código
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Após o pagamento, ativamos sua assinatura automaticamente.
              </p>
              {polling && <Skeleton className="h-2 w-full" />}
            </div>
          )}

          {checkout && checkout.method === "CREDIT_CARD" && checkout.paymentUrl && (
            <div className="space-y-3 text-center">
              <p className="text-sm">Redirecionando para o pagamento seguro...</p>
              <Button asChild className="w-full">
                <a href={checkout.paymentUrl}>Continuar para o pagamento</a>
              </Button>
            </div>
          )}

          {isMock && checkout && (
            <div className="border-t pt-4 mt-4 space-y-2">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                [DEV] MockProvider — sem provider real.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={triggerMockPayment}
                data-testid="checkout-mock-pay"
              >
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                Simular pagamento recebido
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
