import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import * as bcrypt from "bcryptjs"
import { loginSchema } from "./validations/auth"
import { audit } from "@/lib/audit"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email
        const ipAddress = extractIp(req?.headers as Record<string, string | string[]> | undefined)
        const userAgent = readHeader(req?.headers as Record<string, string | string[]> | undefined, "user-agent")
        const baseCtx = { ipAddress, userAgent }

        try {
          const validation = loginSchema.safeParse(credentials)
          if (!validation.success) {
            await audit({
              action: "auth.login.failed",
              metadata: { email, reason: "validation_failed" },
              contextOverride: { actorType: "ANONYMOUS", ...baseCtx },
            })
            return null
          }

          // Rate limit: > 10 falhas em 5min do mesmo IP → bloqueia.
          if (ipAddress) {
            const recentFails = await prisma.auditLog.count({
              where: {
                action: "auth.login.failed",
                ipAddress,
                createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
              },
            })
            if (recentFails >= 10) {
              await audit({
                action: "auth.login.rate_limited",
                metadata: { email, ipAddress, recentFails },
                contextOverride: { actorType: "ANONYMOUS", ...baseCtx },
              })
              return null
            }
          }

          const user = await prisma.user.findUnique({
            where: { email },
          })

          if (!user) {
            await audit({
              action: "auth.login.failed",
              metadata: { email, reason: "user_not_found" },
              contextOverride: { actorType: "ANONYMOUS", ...baseCtx },
            })
            return null
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isPasswordValid) {
            await audit({
              action: "auth.login.failed",
              tenantUserId: user.id,
              metadata: { email, reason: "wrong_password" },
              contextOverride: { actorType: "ANONYMOUS", ...baseCtx },
            })
            return null
          }

          await audit({
            action: "auth.login.success",
            tenantUserId: user.id,
            entityType: "User",
            entityId: user.id,
            contextOverride: { actorType: "USER", actorId: user.id, ...baseCtx },
          })

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            clinicName: user.clinicName,
          }
        } catch (error) {
          console.error("Auth error:", error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: any; user: any }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.clinicName = (user as any).clinicName
      }
      return token
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        ;(session.user as any).clinicName = token.clinicName as string
      }
      return session
    },
  },
  events: {
    async signOut({ token }) {
      const userId = (token as { id?: string } | null)?.id
      await audit({
        action: "auth.logout",
        tenantUserId: userId ?? null,
        entityType: userId ? "User" : null,
        entityId: userId ?? null,
        contextOverride: {
          actorType: userId ? "USER" : "ANONYMOUS",
          actorId: userId ?? null,
        },
      })
    },
  },
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
}

function readHeader(
  headers: Record<string, string | string[]> | undefined,
  key: string,
): string | null {
  if (!headers) return null
  const v = headers[key] ?? headers[key.toLowerCase()]
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

function extractIp(
  headers: Record<string, string | string[]> | undefined,
): string | null {
  const forwarded = readHeader(headers, "x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null
  return readHeader(headers, "x-real-ip")
}
