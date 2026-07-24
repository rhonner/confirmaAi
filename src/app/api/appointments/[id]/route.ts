import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateAppointmentSchema } from "@/lib/validations/appointment"
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse
} from "@/lib/auth-helpers"
import { isRetroactive } from "@/lib/retroactive"
import { auditWrap } from "@/lib/audit"
import { syncAppointmentUpdate, syncAppointmentDelete } from "@/lib/services/google/mirror"
import type { ApiResponse, AppointmentResponse } from "@/lib/types/api"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        messageLogs: {
          orderBy: { sentAt: "desc" },
        },
      },
    })

    if (!appointment) {
      return notFoundResponse("Agendamento não encontrado")
    }

    return NextResponse.json<ApiResponse<AppointmentResponse>>({
      data: appointment,
    })
  } catch (error) {
    console.error("GET appointment error:", error)
    return serverErrorResponse()
  }
}

export const PUT = auditWrap(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    // Verify appointment exists and belongs to user
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existingAppointment) {
      return notFoundResponse("Agendamento não encontrado")
    }

    const body = await request.json()
    const validation = updateAppointmentSchema.safeParse(body)

    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const { patientId, dateTime, durationMinutes, status, notes } = validation.data

    // If patientId is being changed, verify it belongs to user
    if (patientId && patientId !== existingAppointment.patientId) {
      const patient = await prisma.patient.findFirst({
        where: {
          id: patientId,
          userId: session.user.id,
        },
      })

      if (!patient) {
        return badRequestResponse("Paciente não encontrado")
      }
    }

    // SOBREPOSIÇÃO É PERMITIDA (decisão do dono 2026-07-24) — o antigo 400
    // "Conflito com agendamento de X" saiu daqui e do POST. Arrastar um card
    // para cima de outro na grade agora só reagenda (a grade os desenha em
    // colunas lado a lado, como o Google Agenda).
    const updateData: any = {}
    if (patientId !== undefined) updateData.patientId = patientId
    if (dateTime !== undefined) {
      updateData.dateTime = new Date(dateTime)
      // Reavalia o flag SEMPRE que o horário é reescrito: mandar para o passado
      // marca como retroativo (sai da automação); trazer de volta para o futuro
      // devolve o agendamento ao fluxo normal de confirmação/no-show.
      updateData.retroactive = isRetroactive(new Date(dateTime))
    }
    if (durationMinutes !== undefined) updateData.durationMinutes = durationMinutes
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    const appointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        messageLogs: {
          orderBy: { sentAt: "desc" },
        },
      },
    })

    // Fase C: reflete a edição no Google Calendar (patch; delete se virou
    // CANCELED/NO_SHOW; cria se ainda não espelhado). Best-effort, pós-resposta.
    const updatedUserId = session.user.id
    after(() => syncAppointmentUpdate(updatedUserId, id))

    return NextResponse.json<ApiResponse<AppointmentResponse>>({
      data: appointment,
      message: "Agendamento atualizado com sucesso",
    })
  } catch (error) {
    console.error("PUT appointment error:", error)
    return serverErrorResponse()
  }
})

export const DELETE = auditWrap(async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    // Verify appointment exists and belongs to user. Captura googleEventId +
    // se é promovido DO Google (externalEvent) ANTES do hard delete — depois
    // dele a linha (e o link) somem por cascade e o id seria irrecuperável.
    const appointment = await prisma.appointment.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      select: {
        id: true,
        googleEventId: true,
        externalEvent: { select: { id: true } },
      },
    })

    if (!appointment) {
      return notFoundResponse("Agendamento não encontrado")
    }

    await prisma.appointment.delete({
      where: { id },
    })

    // Fase C: apaga o evento espelho no Google (best-effort, pós-resposta).
    // Não toca eventos promovidos DO Google (hadExternalEvent) — o evento
    // original é do usuário.
    const deletedUserId = session.user.id
    const deletedGoogleEventId = appointment.googleEventId
    const hadExternalEvent = appointment.externalEvent !== null
    after(() =>
      syncAppointmentDelete(deletedUserId, {
        appointmentId: id,
        googleEventId: deletedGoogleEventId,
        hadExternalEvent,
      }),
    )

    return NextResponse.json<ApiResponse<null>>({
      data: null,
      message: "Agendamento excluído com sucesso",
    })
  } catch (error) {
    console.error("DELETE appointment error:", error)
    return serverErrorResponse()
  }
})
