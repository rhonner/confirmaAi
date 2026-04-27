import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { updateSettingsSchema } from "@/lib/validations/settings"
import { getAuthSession, unauthorizedResponse, badRequestResponse, serverErrorResponse } from "@/lib/auth-helpers"
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

export async function PUT(request: NextRequest) {
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
}
