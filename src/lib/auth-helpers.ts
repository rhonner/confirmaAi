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
