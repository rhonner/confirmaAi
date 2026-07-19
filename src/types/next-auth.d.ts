import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      clinicName: string
      /** Ramo do negócio (onboarding) — dirige a terminologia da UI. */
      businessType: string | null
      /** null = onboarding ainda não concluído (mostra o wizard). ISO string. */
      onboardingCompletedAt: string | null
    }
    /** "AccountRevoked" quando a conta some/soft-delete → client faz signOut. */
    error?: string
  }

  interface User {
    id: string
    email: string
    name: string
    clinicName: string
    businessType?: string | null
    onboardingCompletedAt?: Date | string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    email: string
    name: string
    clinicName: string
    businessType?: string | null
    onboardingCompletedAt?: string | null
    /** Marca a sessão como revogada (conta removida/soft-deleted). */
    revoked?: boolean
  }
}
