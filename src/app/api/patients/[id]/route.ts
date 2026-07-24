import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { updatePatientSchema } from "@/lib/validations/patient"
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse
} from "@/lib/auth-helpers"
import { auditWrap } from "@/lib/audit"
import { attachCpfToExistingSlot, canonicalizePhone, hashCpf } from "@/lib/billing"
import { canonicalizeCpf } from "@/lib/anti-fraud/cpf-validator"
import { normalizeGender } from "@/lib/gender"
import { syncPatientRename } from "@/lib/services/google/mirror"
import type { ApiResponse, PatientResponse } from "@/lib/types/api"

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

    const patient = await prisma.patient.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    })

    if (!patient) {
      return notFoundResponse("Paciente não encontrado")
    }

    return NextResponse.json<ApiResponse<PatientResponse>>({
      data: patient,
    })
  } catch (error) {
    console.error("GET patient error:", error)
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

    // Verify patient exists and belongs to user
    const existingPatient = await prisma.patient.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    })

    if (!existingPatient) {
      return notFoundResponse("Paciente não encontrado")
    }

    const body = await request.json()
    if (body.cpf === "") body.cpf = undefined
    if (body.birthDate === "") body.birthDate = null
    if (body.sex === "") body.sex = null
    if (body.gender === "") body.gender = null
    if (body.genderSelfDescribed === "") body.genderSelfDescribed = null
    const validation = updatePatientSchema.safeParse(body)

    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const data = validation.data
    const updatePayload: Record<string, unknown> = { ...data }

    // Gênero: normaliza SEMPRE que o campo vier no payload, para o par ficar
    // coerente. Sair de "Prefiro me autodescrever" APAGA o texto anterior —
    // sem esse null explícito o banco guardaria uma descrição de identidade que
    // o usuário acredita ter removido. Ver src/lib/gender.ts.
    if ("gender" in data || "genderSelfDescribed" in data) {
      // Normaliza o par PÓS-MERGE com o estado atual. Um PUT parcial (só
      // `genderSelfDescribed`, por exemplo) tem `data.gender === undefined` —
      // normalizar o payload cru devolveria `gender: null` e APAGARIA a
      // identidade já cadastrada. Achado de code-review, 2026-07-24.
      const merged = {
        gender: "gender" in data ? data.gender : existingPatient.gender,
        genderSelfDescribed:
          "genderSelfDescribed" in data
            ? data.genderSelfDescribed
            : existingPatient.genderSelfDescribed,
      }
      const normalized = normalizeGender(merged)
      updatePayload.gender = normalized.gender
      updatePayload.genderSelfDescribed = normalized.genderSelfDescribed
    }

    // Manter phoneCanonical em sincronia se phone mudar.
    if (typeof data.phone === "string") {
      updatePayload.phoneCanonical = canonicalizePhone(data.phone)
    }

    // CPF: se fornecido pela primeira vez (slot ainda PHONE), promove o slot.
    // Mudança de CPF para outro CPF NÃO é permitida nesta sprint (impacto na vaga).
    let promoteCpf: string | null = null
    if (typeof data.cpf === "string" && data.cpf.trim() !== "") {
      const canonical = canonicalizeCpf(data.cpf)
      const newHash = hashCpf(canonical)
      if (existingPatient.cpfHash && existingPatient.cpfHash !== newHash) {
        return badRequestResponse(
          "Para corrigir o CPF de um paciente, exclua e recadastre — a vaga é preservada.",
        )
      }
      updatePayload.cpf = canonical
      updatePayload.cpfHash = newHash
      if (!existingPatient.cpfHash) promoteCpf = canonical
    } else if (data.cpf === null) {
      // Não permitir remover CPF (vaga ficaria órfã na promoção).
      return badRequestResponse("CPF não pode ser removido após cadastrado")
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: updatePayload,
      include: {
        _count: { select: { appointments: true } },
      },
    })

    if (promoteCpf) {
      await attachCpfToExistingSlot(prisma, session.user.id, patient.id, promoteCpf)
    }

    // Fase C: se o nome mudou, atualiza o título dos eventos espelho no Google
    // (best-effort, pós-resposta). No-op se não for PREMIUM conectado c/ escrita.
    if (typeof data.name === "string" && data.name !== existingPatient.name) {
      const renameUserId = session.user.id
      after(() => syncPatientRename(renameUserId, patient.id))
    }

    return NextResponse.json<ApiResponse<PatientResponse>>({
      data: patient,
      message: "Paciente atualizado com sucesso",
    })
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "P2002") {
      const target = (error as { meta?: { target?: string[] } }).meta?.target
      if (Array.isArray(target) && target.includes("cpfHash")) {
        return badRequestResponse("CPF já cadastrado para este usuário")
      }
      return badRequestResponse("Telefone já cadastrado para este usuário")
    }
    console.error("PUT patient error:", error)
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

    // Verify patient exists and belongs to user
    const patient = await prisma.patient.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
      include: {
        appointments: {
          where: {
            dateTime: { gte: new Date() },
            status: { notIn: ["CANCELED", "NO_SHOW"] },
          },
        },
      },
    })

    if (!patient) {
      return notFoundResponse("Paciente não encontrado")
    }

    // Check for future appointments
    if (patient.appointments.length > 0) {
      return badRequestResponse(
        "Não é possível excluir paciente com agendamentos futuros"
      )
    }

    await prisma.patient.delete({
      where: { id },
    })

    return NextResponse.json<ApiResponse<null>>({
      data: null,
      message: "Paciente excluído com sucesso",
    })
  } catch (error) {
    console.error("DELETE patient error:", error)
    return serverErrorResponse()
  }
})
