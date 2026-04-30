import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AppointmentStatus } from "@/generated/prisma/client"
import { getAuthSession, unauthorizedResponse, serverErrorResponse } from "@/lib/auth-helpers"
import type { ApiResponse, DashboardStats } from "@/lib/types/api"
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachWeekOfInterval, format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) {
      return unauthorizedResponse()
    }

    // Get user for avgAppointmentValue
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { avgAppointmentValue: true },
    })

    if (!user) {
      return unauthorizedResponse()
    }

    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") ?? "month"
    const now = new Date()

    let periodStart: Date
    let periodEnd: Date
    if (range === "7d") {
      periodEnd = now
      periodStart = subDays(now, 7)
    } else if (range === "30d") {
      periodEnd = now
      periodStart = subDays(now, 30)
    } else {
      // default: current month
      periodStart = startOfMonth(now)
      periodEnd = endOfMonth(now)
    }

    const monthFilter = {
      userId: session.user.id,
      dateTime: { gte: periodStart, lte: periodEnd },
    }

    // Use efficient count queries instead of loading all appointments
    const [totalAppointments, confirmed, notConfirmedCount, pendingCount, noShow, canceled, appointments] = await Promise.all([
      prisma.appointment.count({ where: monthFilter }),
      prisma.appointment.count({ where: { ...monthFilter, status: "CONFIRMED" } }),
      prisma.appointment.count({ where: { ...monthFilter, status: "NOT_CONFIRMED" } }),
      prisma.appointment.count({ where: { ...monthFilter, status: "PENDING" } }),
      prisma.appointment.count({ where: { ...monthFilter, status: "NO_SHOW" } }),
      prisma.appointment.count({ where: { ...monthFilter, status: "CANCELED" } }),
      // Still need individual appointments for weekly chart data
      prisma.appointment.findMany({
        where: monthFilter,
        select: { status: true, dateTime: true },
      }),
    ])

    const notConfirmed = notConfirmedCount + pendingCount

    const confirmationRate = totalAppointments > 0
      ? Number(((confirmed / totalAppointments) * 100).toFixed(1))
      : 0
    const noShowRate = totalAppointments > 0
      ? Number(((noShow / totalAppointments) * 100).toFixed(1))
      : 0
    const avgValue = Number(user.avgAppointmentValue)
    const estimatedLoss = Number((noShow * avgValue).toFixed(2))

    // Calculate weekly data
    const weeks = eachWeekOfInterval(
      { start: periodStart, end: periodEnd },
      { weekStartsOn: 0 }
    )

    const weeklyData = weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 })

      const weekAppointments = appointments.filter((a) => {
        const date = new Date(a.dateTime)
        return date >= weekStart && date <= weekEnd
      })

      return {
        week: format(weekStart, "'Sem' d/MM", { locale: ptBR }),
        total: weekAppointments.length,
        noShow: weekAppointments.filter((a) => a.status === AppointmentStatus.NO_SHOW).length,
        confirmed: weekAppointments.filter((a) => a.status === AppointmentStatus.CONFIRMED).length,
      }
    })

    const stats: DashboardStats = {
      totalAppointments,
      confirmed,
      notConfirmed,
      noShow,
      canceled,
      confirmationRate,
      noShowRate,
      estimatedLoss,
      weeklyData,
    }

    return NextResponse.json<ApiResponse<DashboardStats>>({
      data: stats,
    })
  } catch (error) {
    console.error("GET dashboard error:", error)
    return serverErrorResponse()
  }
}
