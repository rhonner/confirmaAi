import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createPatientSchema } from "@/lib/validations/patient"
import { getAuthSession, unauthorizedResponse, badRequestResponse, paywallResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { auditWrap } from "@/lib/audit"
import {
  canonicalizePhone,
  checkEntitlement,
  hashCpf,
  reserveSlotInTx,
  SlotConflictError,
} from "@/lib/billing"
import { canonicalizeCpf } from "@/lib/anti-fraud/cpf-validator"
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

export const POST = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const body = await request.json()

    if (body.email === "") body.email = undefined
    if (body.notes === "") body.notes = undefined
    if (body.cpf === "") body.cpf = undefined

    const validation = createPatientSchema.safeParse(body)

    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const { name, phone, cpf, email, notes } = validation.data
    const userId = session.user.id

    const phoneCanonical = canonicalizePhone(phone)
    const cpfCanonical = cpf ? canonicalizeCpf(cpf) : null
    const cpfHash = cpfCanonical ? hashCpf(cpfCanonical) : null

    // Pre-gate: feedback rápido sem tx pesada (CPF_REQUIRED no Free etc).
    const decision = await checkEntitlement(userId, "patient.create", {
      identifier: { cpf: cpfCanonical, phone },
    })
    if (!decision.allowed) {
      return paywallResponse({
        reason: decision.reason,
        upgrade: decision.upgrade,
        current: decision.current,
        limit: decision.limit,
      })
    }

    // Tx Serializable: cria Patient + reserva slot atomicamente.
    try {
      const patient = await prisma.$transaction(
        async (tx) => {
          const created = await tx.patient.create({
            data: {
              name,
              phone,
              phoneCanonical,
              cpf: cpfCanonical,
              cpfHash,
              email,
              notes,
              userId,
            },
            include: { _count: { select: { appointments: true } } },
          })

          const reserve = await reserveSlotInTx(
            tx,
            userId,
            { cpf: cpfCanonical, phone },
            created.id,
          )

          if (!reserve.ok) {
            throw new QuotaExceededInTx(
              reserve.reason,
              reserve.plan,
              reserve.current,
              reserve.limit,
            )
          }

          return created
        },
        { isolationLevel: "Serializable" },
      )

      return NextResponse.json<ApiResponse<PatientResponse>>(
        { data: patient, message: "Paciente criado com sucesso" },
        { status: 201 },
      )
    } catch (txError: unknown) {
      if (txError instanceof QuotaExceededInTx) {
        return paywallResponse({
          reason: "QUOTA_EXCEEDED",
          upgrade: "PRO",
          current: txError.current,
          limit: txError.limit,
        })
      }
      if (txError instanceof SlotConflictError) {
        const field = txError.identifierType === "CPF" ? "CPF" : "telefone"
        return badRequestResponse(`Paciente já cadastrado com esse ${field}`)
      }
      throw txError
    }
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      const target = (error as { meta?: { target?: string[] } }).meta?.target
      if (Array.isArray(target) && target.includes("cpfHash")) {
        return badRequestResponse("CPF já cadastrado para este usuário")
      }
      return badRequestResponse("Telefone já cadastrado para este usuário")
    }
    console.error("POST patient error:", error)
    return serverErrorResponse()
  }
})

class QuotaExceededInTx extends Error {
  constructor(
    public reason: "QUOTA_EXCEEDED",
    public plan: string,
    public current: number,
    public limit: number,
  ) {
    super("QUOTA_EXCEEDED")
  }
}
