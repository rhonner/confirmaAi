import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      clinicName: string
    }
    /** "AccountRevoked" quando a conta some/soft-delete → client faz signOut. */
    error?: string
  }

  interface User {
    id: string
    email: string
    name: string
    clinicName: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    email: string
    name: string
    clinicName: string
    /** Marca a sessão como revogada (conta removida/soft-deleted). */
    revoked?: boolean
  }
}
