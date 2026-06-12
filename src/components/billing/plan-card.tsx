"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/billing/plans";
import { PLAN_LABELS, PLAN_TAGLINES, formatBRL } from "./plan-meta";

type Props = {
  tier: "FREE" | "PRO" | "PREMIUM";
  current?: boolean;
  highlighted?: boolean;
  className?: string;
  ctaHref?: string;
  ctaLabel?: string;
};

// Só features que EXISTEM no produto. Linhas de roadmap (multi-profissional,
// Google Calendar, NF-e, API, relatórios avançados) saíram em 2026-06-12:
// vender o que não existe é risco CDC + churn. Reintroduzir linha a linha
// quando cada feature for real (junto com a volta do plano Premium).
const FEATURE_ROWS: Array<{ key: keyof typeof PLANS.FREE.features | "patientSlots" | "messages"; label: string }> = [
  { key: "patientSlots", label: "Pacientes únicos vitalícios" },
  { key: "messages", label: "Mensagens WhatsApp/mês" },
  { key: "exportCsv", label: "Exportar CSV" },
];

export function PlanCard({
  tier,
  current,
  highlighted,
  className,
  ctaHref,
  ctaLabel,
}: Props) {
  const plan = PLANS[tier];
  const price = formatBRL(plan.priceMonthly);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm",
        highlighted && "border-primary ring-1 ring-primary/30",
        className,
      )}
      data-testid={`plan-card-${tier}`}
    >
      {highlighted && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
          Recomendado
        </span>
      )}
      {current && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          Plano atual
        </span>
      )}

      <div className="space-y-1">
        <h3 className="text-lg font-bold">{PLAN_LABELS[tier]}</h3>
        <p className="text-xs text-muted-foreground">{PLAN_TAGLINES[tier]}</p>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-extrabold tabular-nums">{price}</span>
        {plan.priceMonthly > 0 && (
          <span className="text-sm text-muted-foreground">/mês</span>
        )}
      </div>

      <ul className="space-y-2 text-sm">
        {FEATURE_ROWS.map((row) => {
          let value: React.ReactNode;
          if (row.key === "patientSlots") {
            value = plan.patientSlots === null ? "Ilimitado" : `${plan.patientSlots}`;
          } else if (row.key === "messages") {
            value = plan.messagesIncluded.toLocaleString("pt-BR");
          } else {
            const has = plan.features[row.key as keyof typeof plan.features];
            value = has ? <Check className="h-4 w-4 text-emerald-500" /> : <span className="text-muted-foreground/40">—</span>;
          }
          return (
            <li key={row.key} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium">{value}</span>
            </li>
          );
        })}
      </ul>

      {ctaHref ? (
        <Button asChild className="mt-2" disabled={current}>
          <Link href={ctaHref} aria-disabled={current}>
            {ctaLabel ?? (current ? "Plano atual" : `Assinar ${PLAN_LABELS[tier]}`)}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
