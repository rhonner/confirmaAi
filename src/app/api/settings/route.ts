import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateSettingsSchema } from "@/lib/validations/settings"
import { stripResponseInstruction } from "@/lib/services/message-template"
import { getAuthSession, unauthorizedResponse, badRequestResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { auditWrap } from "@/lib/audit"
import type { ApiResponse, SettingsResponse } from "@/lib/types/api"

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avgAppointmentValue: true, clinicName: true },
    })

    let settings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    })

    // Create default settings if they don't exist
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          userId: session.user.id,
        },
      })
    }

    return NextResponse.json<ApiResponse<SettingsResponse>>({
      data: {
        ...settings,
        avgAppointmentValue: Number(user?.avgAppointmentValue ?? 0),
        clinicName: user?.clinicName ?? "",
      },
    })
  } catch (error) {
    console.error("GET settings error:", error)
    return serverErrorResponse()
  }
}

export const PUT = auditWrap(async (request: NextRequest) => {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    const body = await request.json()
    const validation = updateSettingsSchema.safeParse(body)

    if (!validation.success) {
      return badRequestResponse(validation.error.issues[0].message)
    }

    // Ensure settings exist
    let existingSettings = await prisma.settings.findUnique({
      where: { userId: session.user.id },
    })

    if (!existingSettings) {
      existingSettings = await prisma.settings.create({
        data: {
          userId: session.user.id,
        },
      })
    }

    const { avgAppointmentValue, clinicName, ...settingsData } = validation.data

    // A instrução de resposta ("Responda 1 para CONFIRMAR ou 2 para CANCELAR.")
    // é dona do sistema e anexada no envio — o banco guarda só o corpo livre.
    // Removemos qualquer instrução embutida que o usuário tenha digitado para
    // não duplicar/contradizer a canônica. Ver message-template.ts.
    if (settingsData.confirmationMessage !== undefined) {
      settingsData.confirmationMessage = stripResponseInstruction(settingsData.confirmationMessage)
    }
    if (settingsData.reminderMessage !== undefined) {
      settingsData.reminderMessage = stripResponseInstruction(settingsData.reminderMessage)
    }

    const settings = await prisma.settings.update({
      where: { userId: session.user.id },
      data: settingsData,
    })

    // Update User-level fields if provided.
    if (avgAppointmentValue !== undefined || clinicName !== undefined) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          ...(avgAppointmentValue !== undefined ? { avgAppointmentValue } : {}),
          ...(clinicName !== undefined ? { clinicName } : {}),
        },
      })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avgAppointmentValue: true, clinicName: true },
    })

    return NextResponse.json<ApiResponse<SettingsResponse>>({
      data: {
        ...settings,
        avgAppointmentValue: Number(user?.avgAppointmentValue ?? 0),
        clinicName: user?.clinicName ?? "",
      },
      message: "Configurações atualizadas com sucesso",
    })
  } catch (error) {
    console.error("PUT settings error:", error)
    return serverErrorResponse()
  }
})
