import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AppointmentStatus } from "@/generated/prisma/client"
import { createAppointmentSchema } from "@/lib/validations/appointment"
import { getAuthSession, unauthorizedResponse, badRequestResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { findConflictingAppointment } from "@/lib/services/conflict"
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

    // Treat bare date strings ("yyyy-MM-dd") as a full LOCAL day so we don't
    // drop appointments after midnight UTC for timezones west of UTC.
    const bareDate = /^(\d{4})-(\d{2})-(\d{2})$/
    const startOf = (v: string) => {
      const m = v.match(bareDate)
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0)
      return new Date(v)
    }
    const endOf = (v: string) => {
      const m = v.match(bareDate)
      if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999)
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

export async function POST(request: NextRequest) {
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

    // Reject appointments in the past
    const appointmentDate = new Date(dateTime)
    if (appointmentDate < new Date()) {
      return badRequestResponse("Não é possível agendar no passado")
    }

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

    const conflict = await findConflictingAppointment({
      userId: session.user.id,
      dateTime: appointmentDate,
      durationMinutes: duration,
    })
    if (conflict) {
      return badRequestResponse(
        `Conflito com agendamento de ${conflict.patient.name}`,
      )
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        userId: session.user.id,
        dateTime: new Date(dateTime),
        durationMinutes: duration,
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

    return NextResponse.json<ApiResponse<AppointmentResponse>>(
      { data: appointment, message: "Agendamento criado com sucesso" },
      { status: 201 }
    )
  } catch (error) {
    console.error("POST appointment error:", error)
    return serverErrorResponse()
  }
}
