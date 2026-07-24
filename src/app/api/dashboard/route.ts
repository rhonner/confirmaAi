import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { AppointmentStatus } from "@/generated/prisma/client"
import { getAuthSession, unauthorizedResponse, serverErrorResponse } from "@/lib/auth-helpers"
import type { ApiResponse, DashboardStats } from "@/lib/types/api"
import { startOfMonth, endOfMonth, endOfWeek, eachWeekOfInterval, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { APP_TIMEZONE, fromAppTz, toAppTz, formatInTimeZone, todayIsoInAppTz } from "@/lib/timezone"
import { splitBirthdays, ageOn } from "@/lib/birthday"

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
    const nowZoned = toAppTz(now)

    let periodStart: Date
    let periodEnd: Date
    if (range === "7d") {
      periodEnd = now
      periodStart = subDays(now, 7)
    } else if (range === "30d") {
      periodEnd = now
      periodStart = subDays(now, 30)
    } else {
      // default: current month — boundaries computed in BRT, not UTC
      periodStart = fromAppTz(startOfMonth(nowZoned))
      periodEnd = fromAppTz(endOfMonth(nowZoned))
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

    // Weekly buckets: iterate in BRT wall-clock, then convert each boundary
    // back to a real UTC instant for filtering against the (UTC) appointment dates.
    const weeksZoned = eachWeekOfInterval(
      { start: toAppTz(periodStart), end: toAppTz(periodEnd) },
      { weekStartsOn: 0 }
    )

    const weeklyData = weeksZoned.map((weekStartZoned) => {
      const weekEndZoned = endOfWeek(weekStartZoned, { weekStartsOn: 0 })
      const weekStart = fromAppTz(weekStartZoned)
      const weekEnd = fromAppTz(weekEndZoned)

      const weekAppointments = appointments.filter((a) => {
        const date = new Date(a.dateTime)
        return date >= weekStart && date <= weekEnd
      })

      return {
        week: formatInTimeZone(weekStart, APP_TIMEZONE, "'Sem' d/MM", { locale: ptBR }),
        total: weekAppointments.length,
        noShow: weekAppointments.filter((a) => a.status === AppointmentStatus.NO_SHOW).length,
        confirmed: weekAppointments.filter((a) => a.status === AppointmentStatus.CONFIRMED).length,
      }
    })

    // ── Aniversariantes (hoje + próximos 7 dias) ────────────────────────────
    // "Hoje" vem SEMPRE de `todayIsoInAppTz()`: com `new Date().getDate()` no
    // runtime UTC da Vercel o card viraria de dia às 21:00 BRT (mesma classe do
    // bug de fuso já documentado em features/dashboard.md).
    //
    // Filtro no banco por PREFIXO do mês (`contains: "-MM-"`) para não carregar
    // a base inteira: só os meses que a janela alcança (hoje + 7 dias cruza no
    // máximo 2 meses). O casamento exato de dia — incluindo 29/02 → 28/02 — fica
    // em `splitBirthdays` (puro e testado), não em SQL.
    const todayIso = todayIsoInAppTz()
    const monthsInWindow = new Set<string>()
    for (let i = 0; i <= 7; i++) {
      const d = new Date(`${todayIso}T12:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() + i)
      monthsInWindow.add(d.toISOString().slice(5, 7))
    }
    const birthdayCandidates = await prisma.patient.findMany({
      where: {
        userId: session.user.id,
        archivedAt: null,
        OR: [...monthsInWindow].map((mm) => ({ birthDate: { contains: `-${mm}-` } })),
      },
      select: { id: true, name: true, phone: true, birthDate: true },
      orderBy: { name: "asc" },
    })
    const split = splitBirthdays(
      birthdayCandidates.filter((p): p is typeof p & { birthDate: string } => !!p.birthDate),
      todayIso,
      7,
    )
    const birthdays = {
      today: split.today.map((p) => ({ ...p, age: ageOn(p.birthDate, todayIso) })),
      upcoming: split.upcoming.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        birthDate: p.birthDate,
        inDays: p.inDays,
      })),
    }

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
      birthdays,
    }

    return NextResponse.json<ApiResponse<DashboardStats>>({
      data: stats,
    })
  } catch (error) {
    console.error("GET dashboard error:", error)
    return serverErrorResponse()
  }
}
