import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthSession, unauthorizedResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { buildCsv } from "@/lib/csv"

export async function GET(_req: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) return unauthorizedResponse()

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
        p.createdAt.toISOString(),
      ]),
    )

    const filename = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`
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
