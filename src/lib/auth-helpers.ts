import { getServerSession } from "next-auth"
import { authOptions } from "./auth"
import { NextResponse } from "next/server"
import { prisma } from "./prisma"
import type { ApiResponse } from "./types/api"

export async function getAuthSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null

  // Defend against stale JWT: token contains a user.id that no longer exists in DB.
  const exists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  })
  if (!exists) return null
  return session
}

export function unauthorizedResponse() {
  return NextResponse.json<ApiResponse>(
    { error: "Não autorizado" },
    { status: 401 }
  )
}

export function forbiddenResponse() {
  return NextResponse.json<ApiResponse>(
    { error: "Acesso negado" },
    { status: 403 }
  )
}

export function notFoundResponse(message = "Recurso não encontrado") {
  return NextResponse.json<ApiResponse>(
    { error: message },
    { status: 404 }
  )
}

export function badRequestResponse(message: string) {
  return NextResponse.json<ApiResponse>(
    { error: message },
    { status: 400 }
  )
}

export function serverErrorResponse(message = "Erro interno do servidor") {
  return NextResponse.json<ApiResponse>(
    { error: message },
    { status: 500 }
  )
}

/**
 * 402 Payment Required — usado quando uma ação é bloqueada pelo plano.
 * Body inclui `reason` semântico e `upgrade.plan` para o frontend abrir
 * o paywall sem chumbar copy no backend.
 */
export function paywallResponse(opts: {
  reason: "QUOTA_EXCEEDED" | "PLAN_REQUIRED" | "PAYMENT_PAST_DUE" | "SUSPENDED" | "CPF_REQUIRED" | "EMAIL_NOT_VERIFIED";
  message?: string;
  upgrade?: "PRO" | "PREMIUM";
  current?: number;
  limit?: number;
}) {
  const defaultMessages: Record<typeof opts.reason, string> = {
    QUOTA_EXCEEDED: "Limite de pacientes do plano atingido",
    PLAN_REQUIRED: "Recurso disponível em planos pagos",
    PAYMENT_PAST_DUE: "Pagamento em atraso",
    SUSPENDED: "Conta suspensa",
    CPF_REQUIRED: "CPF do paciente é obrigatório no plano Free",
    EMAIL_NOT_VERIFIED: "Confirme seu email antes de cadastrar pacientes",
  }
  return NextResponse.json<ApiResponse>(
    {
      error: opts.reason,
      message: opts.message ?? defaultMessages[opts.reason],
      data: {
        upgrade: opts.upgrade ?? "PRO",
        current: opts.current,
        limit: opts.limit,
      } as never,
    },
    { status: 402 }
  )
}
