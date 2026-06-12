import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthSession, unauthorizedResponse, paywallResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { checkEntitlement } from "@/lib/billing"
import { buildCsv } from "@/lib/csv"
import { APP_TIMEZONE, formatInTimeZone, todayIsoInAppTz } from "@/lib/timezone"

export async function GET(_req: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) return unauthorizedResponse()

    // Export CSV é feature de plano pago — o card sempre disse isso, mas o
    // gate só foi aplicado em 2026-06-12 (antes, Free também exportava).
    const decision = await checkEntitlement(session.user.id, "export.csv")
    if (!decision.allowed) {
      return paywallResponse({ reason: decision.reason, upgrade: decision.upgrade })
    }

    const patients = await prisma.patient.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
      include: { _count: { select: { appointments: true } } },
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
    const noShowMap = new Map(noShowCounts.map((c) => [c.patientId, c._count._all]))

    const csv = buildCsv(
      ["Nome", "Telefone", "Email", "Consultas", "Faltas", "Observacoes", "Criado em"],
      patients.map((p) => [
        p.name,
        p.phone,
        p.email ?? "",
        p._count.appointments,
        noShowMap.get(p.id) ?? 0,
        p.notes ?? "",
        formatInTimeZone(p.createdAt, APP_TIMEZONE, "dd/MM/yyyy HH:mm"),
      ]),
    )

    const filename = `pacientes-${todayIsoInAppTz()}.csv`
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("export patients error:", error)
    return serverErrorResponse()
  }
}
