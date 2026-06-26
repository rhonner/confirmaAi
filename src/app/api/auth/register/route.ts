import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import * as bcrypt from "bcryptjs"
import { registerSchema } from "@/lib/validations/auth"
import { audit, auditWrap, getAuditContext } from "@/lib/audit"
import { canonicalizeDocument } from "@/lib/anti-fraud/document"
import { hashDocument } from "@/lib/billing"
import { isDisposableEmail } from "@/lib/anti-fraud/disposable-emails"
import {
  checkSignupRateLimit,
  trackSignupAttempt,
} from "@/lib/anti-fraud/signup-rate-limit"
import { verifyRecaptchaToken } from "@/lib/anti-fraud/recaptcha"
import {
  createVerificationToken,
  sendVerificationEmail,
} from "@/lib/anti-fraud/email-verification"
import { detectOwnerCpfReuse } from "@/lib/anti-fraud/owner-cpf-dedup"
import { captureError } from "@/lib/observability"
import { LEGAL_VERSION } from "@/lib/legal/content"
import type { ApiResponse } from "@/lib/types/api"

export const POST = auditWrap(async (request: NextRequest) => {
  const ipAddress = getAuditContext()?.ipAddress ?? null

  try {
    const rawBody = await request.json()
    const validation = registerSchema.safeParse(rawBody)

    // 1. Honeypot — se preenchido, finge sucesso silenciosamente.
    // Bots não recebem feedback de detecção, dificultando ajustar o ataque.
    if (
      typeof rawBody?.website === "string" &&
      rawBody.website.trim() !== ""
    ) {
      await audit({
        action: "signup.honeypot_triggered",
        metadata: { honeypotValue: rawBody.website.slice(0, 50) },
      })
      return NextResponse.json<ApiResponse>(
        { message: "Cadastro recebido" },
        { status: 201 },
      )
    }

    // 2. Schema validation (incluindo CPF do dono, termos)
    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        { error: "Dados inválidos", message: validation.error.issues[0].message },
        { status: 400 },
      )
    }

    const {
      email,
      password,
      name,
      clinicName,
      avgAppointmentValue,
      cpf,
      recaptchaToken,
    } = validation.data

    // 3. Disposable email blocklist
    if (isDisposableEmail(email)) {
      await audit({
        action: "signup.disposable_email_blocked",
        metadata: { email, ipAddress },
      })
      await trackSignupAttempt({
        ipAddress,
        email,
        succeeded: false,
        failureReason: "disposable_email",
      })
      return NextResponse.json<ApiResponse>(
        { error: "Email descartável não é permitido" },
        { status: 400 },
      )
    }

    // 4. Rate limit (purpose-built `SignupAttempt`, substitui o pattern Sprint 1)
    const rateGate = await checkSignupRateLimit({ ipAddress, email })
    if (!rateGate.allowed) {
      await audit({
        action: "signup.rate_limited",
        metadata: { reason: rateGate.reason, recent: rateGate.recent, limit: rateGate.limit, email },
      })
      await trackSignupAttempt({
        ipAddress,
        email,
        succeeded: false,
        failureReason: `rate_limit_${rateGate.reason.toLowerCase()}`,
      })
      return NextResponse.json<ApiResponse>(
        { error: "Muitas tentativas de cadastro. Tente novamente em 24h." },
        { status: 429 },
      )
    }

    // 5. reCAPTCHA v3
    const captchaResult = await verifyRecaptchaToken(recaptchaToken, "signup")
    if (!captchaResult.ok) {
      await audit({
        action: "signup.recaptcha_failed",
        metadata: { reason: captchaResult.reason, score: captchaResult.score, email },
      })
      await trackSignupAttempt({
        ipAddress,
        email,
        succeeded: false,
        failureReason: `recaptcha_${captchaResult.reason.toLowerCase()}`,
      })
      const userMessage =
        captchaResult.reason === "MISCONFIGURED"
          ? "Cadastro temporariamente indisponível"
          : "Falha na validação de segurança"
      const status = captchaResult.reason === "MISCONFIGURED" ? 503 : 400
      return NextResponse.json<ApiResponse>({ error: userMessage }, { status })
    }

    // 6. Already exists?
    const existingByEmail = await prisma.user.findUnique({ where: { email } })
    if (existingByEmail) {
      await trackSignupAttempt({
        ipAddress,
        email,
        succeeded: false,
        failureReason: "email_exists",
      })
      return NextResponse.json<ApiResponse>(
        { error: "Email já cadastrado" },
        { status: 409 },
      )
    }

    // Documento do dono = CPF ou CNPJ (canônico, só dígitos). `hashDocument`
    // despacha por tamanho e mantém o namespace `cpf:` p/ CPF (hashes já gravados
    // seguem batendo). Persistido em `User.cpf/cpfHash`.
    const cpfCanonical = canonicalizeDocument(cpf)
    const cpfHashValue = hashDocument(cpfCanonical)

    // Hard-block ao 4º cadastro com mesmo documento (acima do threshold de fraude).
    // Abaixo de 4: cadastro permitido — uma pessoa pode legitimamente ter
    // 2 clínicas. O detector cross-tenant em `detectOwnerCpfReuse` emite
    // audit `fraud.cpf_reused_owner` e auto-suspende a conta mais nova
    // depois que ela é criada (>3).
    const existingSameCpf = await prisma.user.count({
      where: { cpfHash: cpfHashValue },
    })
    if (existingSameCpf >= 4) {
      await audit({
        action: "fraud.cpf_reused_owner",
        metadata: { count: existingSameCpf, blocked: true, email },
      })
      await trackSignupAttempt({
        ipAddress,
        email,
        cpfHash: cpfHashValue,
        succeeded: false,
        failureReason: "cpf_threshold_exceeded",
      })
      return NextResponse.json<ApiResponse>(
        { error: "Limite de contas com esse CPF/CNPJ atingido. Entre em contato com o suporte." },
        { status: 409 },
      )
    }

    // 7. Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Consentimento: NÃO forjar — só grava a prova quando o aceite veio de fato
    // (o front gateia com checkbox obrigatório; uma chamada direta sem aceite
    // registra null em vez de consentimento fabricado). Ver review LGPD.
    const consented = validation.data.acceptedTerms === true

    // 8. Cria User + Settings + Subscription atomicamente
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          clinicName,
          avgAppointmentValue: avgAppointmentValue || 0,
          cpf: cpfCanonical,
          cpfHash: cpfHashValue,
          // Sprint 11 — prova de consentimento (só grava se aceitou de fato).
          termsAcceptedAt: consented ? new Date() : null,
          privacyAcceptedAt: consented ? new Date() : null,
          termsVersion: consented ? LEGAL_VERSION : null,
          consentIp: consented ? ipAddress : null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          clinicName: true,
          avgAppointmentValue: true,
          createdAt: true,
        },
      })

      await tx.settings.create({ data: { userId: created.id } })
      await tx.subscription.create({
        data: { userId: created.id, plan: "FREE", status: "ACTIVE" },
      })

      return created
    })

    // 9. Cross-tenant CPF detection (dono) + auto-suspend se threshold
    await detectOwnerCpfReuse(user.id, cpfHashValue)

    // 10. Email verification — token + envio
    const token = await createVerificationToken(user.id)
    const sendResult = await sendVerificationEmail({
      to: user.email,
      name: user.name,
      token,
    })
    if (!sendResult.ok) {
      console.error("[register] sendVerificationEmail falhou:", sendResult)
      await audit({
        action: "signup.email_send_failed",
        tenantUserId: user.id,
        metadata: { reason: sendResult.reason },
      })
    }

    // 11. Audit + track success
    await audit({
      action: "auth.register",
      entityType: "User",
      entityId: user.id,
      tenantUserId: user.id,
      metadata: { email: user.email, clinicName: user.clinicName, termsVersion: LEGAL_VERSION },
    })
    await trackSignupAttempt({
      ipAddress,
      email,
      cpfHash: cpfHashValue,
      succeeded: true,
    })

    return NextResponse.json<ApiResponse>(
      {
        data: { ...user, emailVerificationPending: true },
        message: "Conta criada. Verifique seu email para ativá-la.",
      },
      { status: 201 },
    )
  } catch (error) {
    // 500 no signup = ninguém consegue se cadastrar. Reporta pro Sentry com
    // contexto (este incidente — migration pendente em prod — ficou invisível
    // 1 dia justamente por o erro ser engolido aqui sem alerta).
    await captureError(error, { area: "request", extra: { route: "/api/auth/register" } })
    return NextResponse.json<ApiResponse>(
      { error: "Erro ao criar usuário" },
      { status: 500 },
    )
  }
})
