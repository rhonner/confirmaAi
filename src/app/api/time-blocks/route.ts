import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { createTimeBlockSchema } from "@/lib/validations/time-block"
import { getAuthSession, unauthorizedResponse, badRequestResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { startOfDayInAppTz, endOfDayInAppTz } from "@/lib/timezone"
import { auditWrap } from "@/lib/audit"
import { syncTimeBlockCreate } from "@/lib/services/google/mirror"
import type { ApiResponse, TimeBlockResponse } from "@/lib/types/api"

// GET /api/time-blocks?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Lista os horários bloqueados do tenant na janela dada (mesma convenção de
// dia local America/Sao_Paulo das rotas de agendamento). Sem paginação — o
// volume por janela é pequeno.
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const bareDate = /^(\d{4})-(\d{2})-(\d{2})$/
    // Parseia validando: uma data malformada (?startDate=abc) NÃO pode virar
    // Invalid Date e derrubar a rota com 500 — respondemos 400. (code-review 2026-07-24)
    const parseStart = (v: string): Date | null => {
      const d = bareDate.test(v) ? startOfDayInAppTz(v) : new Date(v)
      return Number.isNaN(d.getTime()) ? null : d
    }
    const parseEnd = (v: string): Date | null => {
      const d = bareDate.test(v) ? endOfDayInAppTz(v) : new Date(v)
      return Number.isNaN(d.getTime()) ? null : d
    }

    const where: { userId: string; dateTime?: { gte?: Date; lte?: Date } } = {
      userId: session.user.id,
    }
    if (date) {
      const gte = parseStart(date)
      const lte = parseEnd(date)
      if (!gte || !lte) return badRequestResponse("Data inválida")
      where.dateTime = { gte, lte }
    } else if (startDate && endDate) {
      const gte = parseStart(startDate)
      const lte = parseEnd(endDate)
      if (!gte || !lte) return badRequestResponse("Data inválida")
      where.dateTime = { gte, lte }
    } else if (startDate) {
      const gte = parseStart(startDate)
      if (!gte) return badRequestResponse("Data inválida")
      where.dateTime = { gte }
    } else if (endDate) {
      const lte = parseEnd(endDate)
      if (!lte) return badRequestResponse("Data inválida")
      where.dateTime = { lte }
    }

    const blocks = await prisma.timeBlock.findMany({
      where,
      orderBy: { dateTime: "asc" },
    })

    return NextResponse.json<ApiResponse<TimeBlockResponse[]>>({ data: blocks })
  } catch (error) {
    console.error("GET time-blocks error:", error)
    return serverErrorResponse()
  }
}

export const POST = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const body = await request.json()
    const validation = createTimeBlockSchema.safeParse(body)
    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const { dateTime, durationMinutes, title } = validation.data

    const block = await prisma.timeBlock.create({
      data: {
        userId: session.user.id,
        dateTime: new Date(dateTime),
        // omitir → schema aplica os defaults (60 min / "Bloqueado").
        ...(durationMinutes !== undefined ? { durationMinutes } : {}),
        ...(title ? { title } : {}),
      },
    })

    // Fase C: espelha o bloqueio no Google Calendar (best-effort, pós-resposta).
    const createdUserId = session.user.id
    const createdId = block.id
    after(() => syncTimeBlockCreate(createdUserId, createdId))

    return NextResponse.json<ApiResponse<TimeBlockResponse>>(
      { data: block, message: "Horário bloqueado" },
      { status: 201 },
    )
  } catch (error) {
    console.error("POST time-block error:", error)
    return serverErrorResponse()
  }
})
