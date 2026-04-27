import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createPatientSchema } from "@/lib/validations/patient"
import { getAuthSession, unauthorizedResponse, badRequestResponse, serverErrorResponse } from "@/lib/auth-helpers"
import type { ApiResponse, PaginatedResponse, PatientResponse } from "@/lib/types/api"

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const pageParam = searchParams.get("page")
    const limitParam = searchParams.get("limit")

    const where: any = {
      userId: session.user.id,
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
      ]
    }

    // If pagination params are provided, return paginated response
    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam) || 1)
      const limit = Math.min(100, Math.max(1, parseInt(limitParam || "20") || 20))
      const skip = (page - 1) * limit

      const [patients, total] = await Promise.all([
        prisma.patient.findMany({
          where,
          orderBy: { name: "asc" },
          include: {
            _count: {
              select: { appointments: true },
            },
          },
          skip,
          take: limit,
        }),
        prisma.patient.count({ where }),
      ])

      const noShowCounts = patients.length
        ? await prisma.appointment.groupBy({
            by: ["patientId"],
            where: {
              patientId: { in: patients.map((p) => p.id) },
              status: "NO_SHOW",
            },
            _count: { _all: true },
          })
        : []
      const noShowMap = new Map(
        noShowCounts.map((c) => [c.patientId, c._count._all]),
      )

      return NextResponse.json<PaginatedResponse<PatientResponse>>({
        data: patients.map((p) => ({
          ...p,
          noShowCount: noShowMap.get(p.id) ?? 0,
        })),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      })
    }

    // No pagination: return all results (backward compatible)
    const patients = await prisma.patient.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    })

    const noShowCounts = patients.length
      ? await prisma.appointment.groupBy({
          by: ["patientId"],
          where: {
            patientId: { in: patients.map((p) => p.id) },
            status: "NO_SHOW",
          },
          _count: { _all: true },
        })
      : []
    const noShowMap = new Map(
      noShowCounts.map((c) => [c.patientId, c._count._all]),
    )

    const enriched = patients.map((p) => ({
      ...p,
      noShowCount: noShowMap.get(p.id) ?? 0,
    }))

    return NextResponse.json<ApiResponse<PatientResponse[]>>({
      data: enriched,
    })
  } catch (error) {
    console.error("GET patients error:", error)
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

    // Strip empty strings for optional fields before validation
    if (body.email === "") body.email = undefined
    if (body.notes === "") body.notes = undefined

    const validation = createPatientSchema.safeParse(body)

    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const patient = await prisma.patient.create({
      data: {
        ...validation.data,
        userId: session.user.id,
      },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    })

    return NextResponse.json<ApiResponse<PatientResponse>>(
      { data: patient, message: "Paciente criado com sucesso" },
      { status: 201 }
    )
  } catch (error: any) {
    // Handle unique constraint violation (duplicate phone for same user)
    if (error?.code === "P2002") {
      return badRequestResponse("Telefone já cadastrado para este usuário")
    }
    console.error("POST patient error:", error)
    return serverErrorResponse()
  }
}
