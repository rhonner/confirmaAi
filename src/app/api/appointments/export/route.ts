import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthSession, unauthorizedResponse, serverErrorResponse } from "@/lib/auth-helpers"
import { buildCsv } from "@/lib/csv"

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  NOT_CONFIRMED: "Nao confirmado",
  CANCELED: "Cancelado",
  NO_SHOW: "Falta",
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getAuthSession()
    if (!session?.user?.id) return unauthorizedResponse()

    const appointments = await prisma.appointment.findMany({
      where: { userId: session.user.id },
      orderBy: { dateTime: "desc" },
      include: { patient: { select: { name: true, phone: true } } },
    })

    const csv = buildCsv(
      ["Data", "Hora", "Duracao (min)", "Paciente", "Telefone", "Status", "Observacoes"],
      appointments.map((a) => {
        const dt = new Date(a.dateTime)
        return [
          dt.toLocaleDateString("pt-BR"),
          dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          a.durationMinutes,
          a.patient.name,
          a.patient.phone,
          STATUS_LABEL[a.status] ?? a.status,
          a.notes ?? "",
        ]
      }),
    )

    const filename = `agendamentos-${new Date().toISOString().slice(0, 10)}.csv`
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("export appointments error:", error)
    return serverErrorResponse()
  }
}
