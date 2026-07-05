"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";

/**
 * Observa a sessão do NextAuth e, quando o servidor sinaliza que a conta foi
 * removida/desativada (`session.error === "AccountRevoked"`, setado no callback
 * `session` a partir do JWT revalidado contra o banco), força o logout.
 *
 * Rede de segurança em nível de shell (defense-in-depth). A revogação primária é
 * `getAuthSession` → 401 → `signOut` no `fetchApi` a cada request às APIs; este
 * guard cobre o caso em que a revalidação do JWT roda no client (login ou
 * `useSession().update()`, ex: após salvar Configurações) e encontra a conta já
 * removida.
 */
export function SessionGuard() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error === "AccountRevoked") {
      signOut({ callbackUrl: "/login" });
    }
  }, [session?.error]);

  return null;
}
