import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updatePatientSchema } from "@/lib/validations/patient"
import {
  getAuthSession,
  unauthorizedResponse,
  badRequestResponse,
  notFoundResponse,
  serverErrorResponse
} from "@/lib/auth-helpers"
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const validation = updatePatientSchema.safeParse(body)

    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    const patient = await prisma.patient.update({
      where: { id },
      data: validation.data,
      include: {
        _count: {
          select: { appointments: true },
        },
      },
    })

    return NextResponse.json<ApiResponse<PatientResponse>>({
      data: patient,
      message: "Paciente atualizado com sucesso",
    })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return badRequestResponse("Telefone já cadastrado para este usuário")
    }
    console.error("PUT patient error:", error)
    return serverErrorResponse()
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
}
