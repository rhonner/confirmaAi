"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWhatsappStatus } from "@/hooks/use-api";

/**
 * Sprint 8 — banner vermelho persistente no dashboard enquanto o WhatsApp
 * estiver desconectado (anti-churn silencioso: sem ele, as confirmações
 * param e o usuário não percebe).
 *
 * Só aparece quando o tenant JÁ esteve conectado (`connectedAt` presente) e
 * caiu (`DISCONNECTED`/`FAILED`). Quem nunca conectou tem o onboarding em
 * /configuracoes; quem desconectou de propósito (botão desconectar) tem
 * `connectedAt` zerado e não vê o banner.
 */
export function WhatsappDisconnectedBanner() {
  const pathname = usePathname();
  const statusQuery = useWhatsappStatus();

  const data = statusQuery.data;
  const show =
    !!data &&
    !!data.connectedAt &&
    (data.status === "DISCONNECTED" || data.status === "FAILED");

  if (!show) return null;

  return (
    <div
      data-testid="whatsapp-disconnected-banner"
      className="mb-4 flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <MessageSquareOff className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
            WhatsApp desconectado — confirmações automáticas pausadas
          </p>
          <p className="text-xs text-muted-foreground">
            Seus pacientes não estão recebendo confirmações nem lembretes.
            Reconecte escaneando o QR code.
          </p>
        </div>
      </div>
      {pathname !== "/configuracoes" && (
        <Button asChild size="sm" variant="destructive" className="shrink-0">
          <Link href="/configuracoes">Reconectar WhatsApp</Link>
        </Button>
      )}
    </div>
  );
}
