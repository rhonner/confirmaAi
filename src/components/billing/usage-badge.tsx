"use client";

import * as React from "react";
import Link from "next/link";
import { useUsage } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import { MessageCircle, Sparkles, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PLAN_LABELS } from "./plan-meta";

const LEVEL_STYLES: Record<string, { bar: string; ring: string; text: string }> = {
  ok: {
    bar: "bg-emerald-500",
    ring: "ring-emerald-500/20 hover:ring-emerald-500/40",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  warning: {
    bar: "bg-amber-500",
    ring: "ring-amber-500/30 hover:ring-amber-500/50",
    text: "text-amber-600 dark:text-amber-400",
  },
  alert: {
    bar: "bg-orange-500",
    ring: "ring-orange-500/40 hover:ring-orange-500/60",
    text: "text-orange-600 dark:text-orange-400",
  },
  blocked: {
    bar: "bg-red-500",
    ring: "ring-red-500/50 hover:ring-red-500/70",
    text: "text-red-600 dark:text-red-400",
  },
};

export function UsageBadge() {
  const usage = useUsage();

  if (usage.isLoading) {
    return (
      <div
        aria-hidden="true"
        className="hidden sm:flex h-9 w-32 animate-pulse rounded-full bg-muted/40"
      />
    );
  }

  if (usage.isUnlimited) {
    return (
      <div className="inline-flex items-center gap-2">
        <MessageUsagePill usage={usage} />
        <Link
          href="/billing"
          className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 transition-colors"
          aria-label={`Plano ${PLAN_LABELS[usage.plan]}`}
          data-testid="usage-badge-paid"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {PLAN_LABELS[usage.plan]}
        </Link>
      </div>
    );
  }

  const styles = LEVEL_STYLES[usage.level];

  return (
    <div className="inline-flex items-center gap-2">
      <MessageUsagePill usage={usage} />
      <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs font-medium ring-1 transition-all",
            styles.ring,
          )}
          aria-label={`Uso do plano: ${usage.count} de ${usage.limit} pacientes`}
          data-testid="usage-badge"
          data-usage-level={usage.level}
        >
          <Users className={cn("h-3.5 w-3.5", styles.text)} />
          <span className={cn("tabular-nums font-semibold", styles.text)}>
            {usage.count}/{usage.limit}
          </span>
          <span className="hidden sm:inline text-muted-foreground">pacientes</span>
          <div
            className="hidden sm:block h-1.5 w-12 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={usage.percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("h-full transition-all duration-300", styles.bar)}
              style={{ width: `${usage.percentage}%` }}
            />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-2">
          <p className="text-sm font-semibold">Plano {PLAN_LABELS[usage.plan]}</p>
          <p className="text-xs text-muted-foreground">
            Você usou <strong>{usage.count}</strong> das{" "}
            <strong>{usage.limit}</strong> vagas vitalícias de paciente.
          </p>
          {usage.level === "warning" && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Você passou de 60% do limite — bom momento pra conhecer o Pro.
            </p>
          )}
          {usage.level === "alert" && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Faltam só {Math.max(0, (usage.limit ?? 0) - usage.count)} vaga(s).
            </p>
          )}
          {usage.level === "blocked" && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Limite atingido — não é possível cadastrar novos pacientes.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Mensagens no mês: <strong>{usage.messagesSent}</strong> de{" "}
            <strong>{usage.messagesIncluded}</strong>.
          </p>
          {usage.messagesLevel === "blocked" && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Limite de mensagens atingido — confirmações pausadas até o
              próximo ciclo ou upgrade.
            </p>
          )}
          <Link
            href="/billing"
            className="block text-xs font-medium text-primary hover:underline"
          >
            Ver planos e fazer upgrade →
          </Link>
        </div>
      </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Pill de uso de mensagens (Sprint 6). Só aparece a partir de 50% do limite
 * do período — abaixo disso é ruído.
 */
function MessageUsagePill({ usage }: { usage: ReturnType<typeof useUsage> }) {
  if (usage.messagesIncluded <= 0 || usage.messagesPercentage < 50) return null;

  const styles = LEVEL_STYLES[usage.messagesLevel];
  return (
    <Link
      href="/billing"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-medium ring-1 transition-all",
        styles.ring,
      )}
      aria-label={`Mensagens: ${usage.messagesSent} de ${usage.messagesIncluded}`}
      data-testid="message-usage-badge"
      data-usage-level={usage.messagesLevel}
    >
      <MessageCircle className={cn("h-3.5 w-3.5", styles.text)} />
      <span className={cn("tabular-nums font-semibold", styles.text)}>
        {usage.messagesSent}/{usage.messagesIncluded}
      </span>
      <span className="hidden sm:inline text-muted-foreground">msgs</span>
    </Link>
  );
}
