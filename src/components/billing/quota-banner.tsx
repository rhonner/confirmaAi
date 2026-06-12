"use client";

import * as React from "react";
import { useUsage } from "@/hooks/use-api";
import { AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PaywallModal } from "./paywall-modal";

const STORAGE_KEY = "quota-soft-nudge-shown";

/**
 * Banner persistente acima da listagem de pacientes:
 * - 80%+ → banner laranja (alerta com CTA)
 * - 100% → banner vermelho (bloqueio iminente)
 * - <80% → não renderiza
 *
 * Em ≥60% mostra um modal "soft" UMA VEZ por sessão (localStorage flag) — só
 * uma vez para não ser irritante.
 */
export function QuotaBanner() {
  const usage = useUsage();
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const [softNudgeOpen, setSoftNudgeOpen] = React.useState(false);

  // Soft nudge: mostra UMA vez por user quando passa de 60%.
  React.useEffect(() => {
    if (usage.isLoading || usage.isUnlimited) return;
    if (usage.level !== "warning") return;
    try {
      const shown = window.localStorage.getItem(STORAGE_KEY);
      if (!shown) {
        setSoftNudgeOpen(true);
        window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
      }
    } catch {
      // localStorage indisponível — silencioso
    }
  }, [usage.isLoading, usage.isUnlimited, usage.level]);

  if (usage.isLoading || usage.isUnlimited) return null;
  if (usage.level === "ok" || usage.level === "warning") {
    return softNudgeOpen ? (
      <PaywallModal
        open={softNudgeOpen}
        onOpenChange={setSoftNudgeOpen}
        reason="SOFT_NUDGE"
        current={usage.count}
        limit={usage.limit ?? undefined}
        upgrade="PRO"
        variant="soft"
      />
    ) : null;
  }

  const isBlocked = usage.level === "blocked";
  const Icon = isBlocked ? Lock : AlertTriangle;

  return (
    <>
      <div
        role="alert"
        className={cn(
          "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
          isBlocked
            ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
            : "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-100",
        )}
        data-testid="quota-banner"
        data-usage-level={usage.level}
      >
        <div className="flex items-start gap-3">
          <Icon
            className={cn(
              "mt-0.5 h-5 w-5 shrink-0",
              isBlocked ? "text-red-500" : "text-orange-500",
            )}
          />
          <div>
            <p className="text-sm font-semibold">
              {isBlocked
                ? "Você atingiu o limite de pacientes do plano Free"
                : `Faltam ${Math.max(0, (usage.limit ?? 0) - usage.count)} vaga(s) no plano Free`}
            </p>
            <p className="text-xs opacity-80">
              {isBlocked
                ? "Próximo cadastro requer upgrade para Pro ou Premium."
                : "Garanta sua continuidade conhecendo os planos pagos."}
              {" "}
              Você usou <strong>{usage.count}/{usage.limit}</strong> vagas vitalícias.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={isBlocked ? "destructive" : "default"}
          onClick={() => setPaywallOpen(true)}
          className="shrink-0"
        >
          Ver planos
        </Button>
      </div>

      <PaywallModal
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        reason={isBlocked ? "QUOTA_EXCEEDED" : "SOFT_NUDGE"}
        current={usage.count}
        limit={usage.limit ?? undefined}
        upgrade="PRO"
        variant="soft"
      />
    </>
  );
}
