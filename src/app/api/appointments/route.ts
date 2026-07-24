import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { AppointmentStatus } from "@/generated/prisma/client"
import { createAppointmentSchema } from "@/lib/validations/appointment"
import { getAuthSession, unauthorizedResponse, badRequestResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { startOfDayInAppTz, endOfDayInAppTz } from "@/lib/timezone"
import { isRetroactive } from "@/lib/retroactive"
import { auditWrap } from "@/lib/audit"
import { syncAppointmentCreate } from "@/lib/services/google/mirror"
import type { ApiResponse, PaginatedResponse, AppointmentResponse } from "@/lib/types/api"

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get("date")
    const status = searchParams.get("status")
    const patientId = searchParams.get("patientId")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const pageParam = searchParams.get("page")
    const limitParam = searchParams.get("limit")

    const where: any = {
      userId: session.user.id,
    }

    // Treat bare date strings ("yyyy-MM-dd") as a full day in the app TZ
    // (America/Sao_Paulo). On Vercel UTC the old new-Date(y,m,d,...) constructor
    // produced midnight UTC, which is 21:00 BRT of the previous day → 3h drift.
    const bareDate = /^(\d{4})-(\d{2})-(\d{2})$/
    const startOf = (v: string) => {
      if (bareDate.test(v)) return startOfDayInAppTz(v)
      return new Date(v)
    }
    const endOf = (v: string) => {
      if (bareDate.test(v)) return endOfDayInAppTz(v)
      return new Date(v)
    }

    if (date) {
      where.dateTime = { gte: startOf(date), lte: endOf(date) }
    } else if (startDate && endDate) {
      where.dateTime = { gte: startOf(startDate), lte: endOf(endDate) }
    } else if (startDate) {
      where.dateTime = { gte: startOf(startDate) }
    } else if (endDate) {
      where.dateTime = { lte: endOf(endDate) }
    }

    if (status && Object.values(AppointmentStatus).includes(status as AppointmentStatus)) {
      where.status = status
    }

    if (patientId) {
      where.patientId = patientId
    }

    const include = {
      patient: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      messageLogs: {
        orderBy: { sentAt: "desc" as const },
      },
    }

    // If pagination params are provided, return paginated response
    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam) || 1)
      const limit = Math.min(100, Math.max(1, parseInt(limitParam || "20") || 20))
      const skip = (page - 1) * limit

      const [appointments, total] = await Promise.all([
        prisma.appointment.findMany({
          where,
          include,
          orderBy: { dateTime: "asc" },
          skip,
          take: limit,
        }),
        prisma.appointment.count({ where }),
      ])

      return NextResponse.json<PaginatedResponse<AppointmentResponse>>({
        data: appointments,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      })
    }

    // No pagination: return all results (backward compatible)
    const appointments = await prisma.appointment.findMany({
      where,
      include,
      orderBy: { dateTime: "asc" },
    })

    return NextResponse.json<ApiResponse<AppointmentResponse[]>>({
      data: appointments,
    })
  } catch (error) {
    console.error("GET appointments error:", error)
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
    const validation = createAppointmentSchema.safeParse(body)

    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const { patientId, dateTime, durationMinutes, notes } = validation.data
    const duration = durationMinutes ?? 30

    // Agendar no PASSADO é permitido (registro de organização, decisão do dono
    // 2026-07-24): não rejeitamos mais. Marcamos como `retroactive` para o
    // scheduler não mandar WhatsApp nem marcar NO_SHOW automático.
    // O flag é decidido AQUI, no servidor — o cliente não manda esse campo.
    const appointmentDate = new Date(dateTime)
    const retroactive = isRetroactive(appointmentDate)

    // Verify patient belongs to user
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        userId: session.user.id,
      },
    })

    if (!patient) {
      return badRequestResponse("Paciente não encontrado")
    }

    // SOBREPOSIÇÃO É PERMITIDA (decisão do dono 2026-07-24): dois clientes no
    // mesmo horário são um caso real (atendimento simultâneo, sala dupla) e a
    // grade do Dia já os desenha lado a lado, como o Google Agenda. Sem aviso —
    // o antigo 400 "Conflito com agendamento de X" foi removido.
    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        userId: session.user.id,
        dateTime: new Date(dateTime),
        durationMinutes: duration,
        retroactive,
        notes,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        messageLogs: true,
      },
    })

    // Fase C: espelha no Google Calendar do tenant (best-effort, pós-resposta —
    // não bloqueia a criação nem quebra se o Google falhar). No-op se não for
    // PREMIUM conectado com escopo de escrita.
    const createdUserId = session.user.id
    const createdId = appointment.id
    after(() => syncAppointmentCreate(createdUserId, createdId))

    return NextResponse.json<ApiResponse<AppointmentResponse>>(
      { data: appointment, message: "Agendamento criado com sucesso" },
      { status: 201 }
    )
  } catch (error) {
    console.error("POST appointment error:", error)
    return serverErrorResponse()
  }
})
