import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { audit, auditWrap } from "@/lib/audit"
import type { ApiResponse } from "@/lib/types/api"

const bodySchema = z.object({
  email: z.string().email(),
})

/**
 * Stubbed password-reset endpoint.
 *
 * Real implementation would: generate a single-use token, persist it (or sign it),
 * send the link by email through the email provider. We don't have an email
 * provider wired yet, so for now we always respond 200 and log the request server-side.
 *
 * Always returning 200 also prevents user enumeration.
 */
export const POST = auditWrap(async (req: NextRequest) => {
  const json = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json<ApiResponse>(
      { error: "Email inválido" },
      { status: 400 },
    )
  }

  await audit({
    action: "auth.password_reset_requested",
    metadata: { email: parsed.data.email },
  })

  console.info(
    `[forgot-password] reset requested for ${parsed.data.email} (email delivery not configured)`,
  )

  return NextResponse.json<ApiResponse>({
    message: "Se o email existir, um link foi enviado.",
  })
})
