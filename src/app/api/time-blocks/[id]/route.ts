import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateTimeBlockSchema } from "@/lib/validations/time-block"
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers"
import { auditWrap } from "@/lib/audit"
import { syncTimeBlockUpdate, syncTimeBlockDelete } from "@/lib/services/google/mirror"
import type { ApiResponse, TimeBlockResponse } from "@/lib/types/api"

export const PUT = auditWrap(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const existing = await prisma.timeBlock.findFirst({
      where: { id, userId: session.user.id },
    })
    if (!existing) {
      return notFoundResponse("Horário bloqueado não encontrado")
    }

    const body = await request.json()
    const validation = updateTimeBlockSchema.safeParse(body)
    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const { dateTime, durationMinutes, title } = validation.data
    const updateData: { dateTime?: Date; durationMinutes?: number; title?: string } = {}
    if (dateTime !== undefined) updateData.dateTime = new Date(dateTime)
    if (durationMinutes !== undefined) updateData.durationMinutes = durationMinutes
    if (title !== undefined) updateData.title = title

    const block = await prisma.timeBlock.update({
      where: { id },
      data: updateData,
    })

    // Fase C: reflete a edição no evento espelho no Google (best-effort).
    const updatedUserId = session.user.id
    after(() => syncTimeBlockUpdate(updatedUserId, id))

    return NextResponse.json<ApiResponse<TimeBlockResponse>>({
      data: block,
      message: "Bloqueio atualizado",
    })
  } catch (error) {
    console.error("PUT time-block error:", error)
    return serverErrorResponse()
  }
})

export const DELETE = auditWrap(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    // Lê o googleEventId ANTES do hard delete (depois some).
    const block = await prisma.timeBlock.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, googleEventId: true },
    })
    if (!block) {
      return notFoundResponse("Horário bloqueado não encontrado")
    }

    await prisma.timeBlock.delete({ where: { id } })

    // Fase C: apaga o evento espelho no Google (best-effort, pós-resposta).
    const deletedUserId = session.user.id
    const deletedGoogleEventId = block.googleEventId
    after(() =>
      syncTimeBlockDelete(deletedUserId, {
        blockId: id,
        googleEventId: deletedGoogleEventId,
      }),
    )

    return NextResponse.json<ApiResponse<null>>({
      data: null,
      message: "Bloqueio removido",
    })
  } catch (error) {
    console.error("DELETE time-block error:", error)
    return serverErrorResponse()
  }
})
