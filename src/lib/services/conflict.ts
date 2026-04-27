import { prisma } from "@/lib/prisma"

type ConflictArgs = {
  userId: string
  dateTime: Date
  durationMinutes: number
  ignoreId?: string
}

/**
 * Returns the first overlapping appointment, if any. Two appointments overlap when
 * [start, end) intervals intersect. CANCELED and NO_SHOW are ignored.
 */
export async function findConflictingAppointment({
  userId,
  dateTime,
  durationMinutes,
  ignoreId,
}: ConflictArgs) {
  const startMs = dateTime.getTime()
  const endMs = startMs + durationMinutes * 60 * 1000

  // Maximum existing duration we currently allow is 480 min — search a window large enough.
  const lookbackMs = 480 * 60 * 1000
  const candidates = await prisma.appointment.findMany({
    where: {
      userId,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
      status: { notIn: ["CANCELED", "NO_SHOW"] },
      dateTime: {
        gte: new Date(startMs - lookbackMs),
        lte: new Date(endMs),
      },
    },
    select: {
      id: true,
      dateTime: true,
      durationMinutes: true,
      patient: { select: { name: true } },
    },
  })

  for (const c of candidates) {
    const cStart = c.dateTime.getTime()
    const cEnd = cStart + c.durationMinutes * 60 * 1000
    if (cStart < endMs && cEnd > startMs) {
      return c
    }
  }
  return null
}
