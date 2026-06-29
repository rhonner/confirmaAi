"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Download, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PaywallModal, type PaywallReason } from "@/components/billing/paywall-modal";
import { useUsage } from "@/hooks/use-api";

/** Reasons que o PaywallModal sabe renderizar (chaves do TITLES). Validar antes
 *  de repassar evita um crash (`meta.title` de `undefined`) se o backend mandar
 *  um reason novo no 402. */
const KNOWN_REASONS: readonly PaywallReason[] = [
  "QUOTA_EXCEEDED",
  "PLAN_REQUIRED",
  "PAYMENT_PAST_DUE",
  "SUSPENDED",
  "CPF_REQUIRED",
  "EMAIL_NOT_VERIFIED",
  "SOFT_NUDGE",
];

/**
 * Botão de exportar CSV resiliente ao paywall.
 *
 * Antes era um `<a href download>` cru: no plano Free o endpoint responde 402
 * (export.csv é entitlement pago) e o browser exibia uma falha de download
 * genérica ("Erro de servidor desconhecido") — confuso pra quem está no Free
 * (relato da sócia, 2026-06-29). Agora o clique faz `fetch`, e:
 *  - 401 → `signOut` (sessão morta), igual ao `fetchApi`;
 *  - 402 → abre o PaywallModal com o reason/upgrade vindos do corpo;
 *  - ok  → baixa via Blob (filename do Content-Disposition);
 *  - erro → toast amigável (sem "erro de servidor" críptico).
 * Usuário Free vê um cadeado no botão (sinaliza recurso pago antes do clique).
 */
export function ExportCsvButton({ url }: { url: string }) {
  const usage = useUsage();
  // Enquanto a subscription carrega, `plan` cai no default "FREE" — não tratar
  // como Free ainda (senão um PRO vê o cadeado piscar antes do dado chegar).
  const isFree = !usage.isLoading && usage.plan === "FREE";
  const [loading, setLoading] = React.useState(false);
  const [paywall, setPaywall] = React.useState<{
    reason: PaywallReason;
    upgrade?: "PRO" | "PREMIUM";
  } | null>(null);

  async function handleExport() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(url);

      if (res.status === 401) {
        // Sessão morta — mesmo comportamento do fetchApi (use-api.ts).
        await signOut({ callbackUrl: "/login", redirect: true });
        return;
      }

      if (res.status === 402) {
        const body = await res.json().catch(() => null);
        const reason = body?.error as PaywallReason | undefined;
        setPaywall({
          reason: reason && KNOWN_REASONS.includes(reason) ? reason : "PLAN_REQUIRED",
          upgrade: body?.data?.upgrade ?? "PRO",
        });
        return;
      }

      if (!res.ok) {
        toast.error("Não foi possível exportar agora. Tente novamente em instantes.");
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? "export.csv";

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error("Não foi possível exportar agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={handleExport} disabled={loading} aria-busy={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : isFree ? (
          <Lock className="mr-2 h-4 w-4" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        <span className="hidden sm:inline">{loading ? "Exportando..." : "Exportar CSV"}</span>
        <span className="sm:hidden">CSV</span>
      </Button>
      {paywall && (
        <PaywallModal
          open={!!paywall}
          onOpenChange={(open) => !open && setPaywall(null)}
          reason={paywall.reason}
          upgrade={paywall.upgrade}
          variant="soft"
        />
      )}
    </>
  );
}
