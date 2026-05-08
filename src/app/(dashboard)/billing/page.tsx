"use client";

import * as React from "react";
import Link from "next/link";
import { useUsage, useSubscription } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { PlanCard } from "@/components/billing/plan-card";
import { PLAN_LABELS } from "@/components/billing/plan-meta";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function BillingPage() {
  const usage = useUsage();
  const subscriptionQuery = useSubscription();
  const sub = subscriptionQuery.data;
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelLoading, setCancelLoading] = React.useState(false);

  const openPortal = async () => {
    const r = await fetch("/api/billing/portal", { method: "POST" });
    const j = await r.json();
    if (!r.ok || !j.data?.url) {
      toast.error(j?.error ?? "Erro ao abrir portal");
      return;
    }
    window.open(j.data.url, "_blank", "noopener,noreferrer");
  };

  const confirmCancel = async () => {
    setCancelLoading(true);
    try {
      const r = await fetch("/api/billing/cancel", { method: "POST" });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j?.error ?? "Erro ao cancelar");
        return;
      }
      toast.success(j?.message ?? "Assinatura cancelada");
      qc.invalidateQueries({ queryKey: ["subscription"] });
      setCancelOpen(false);
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plano e Cobrança"
        description="Acompanhe seu plano atual, uso e gerencie sua assinatura."
      />

      {/* Resumo do plano atual */}
      <Card>
        <CardHeader>
          <CardTitle>Plano atual</CardTitle>
          <CardDescription>
            {usage.isLoading
              ? "Carregando..."
              : `Você está no plano ${PLAN_LABELS[usage.plan]}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Stat label="Plano" value={PLAN_LABELS[usage.plan]} />
                <Stat label="Status" value={usage.status} />
                <Stat
                  label="Pacientes"
                  value={
                    usage.isUnlimited
                      ? "Ilimitado"
                      : `${usage.count}/${usage.limit}`
                  }
                />
              </div>
              {!usage.isUnlimited && (
                <div className="space-y-1">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${usage.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {usage.percentage}% do limite usado
                  </p>
                </div>
              )}
              {sub?.currentPeriodEnd && (
                <p className="text-xs text-muted-foreground">
                  Próxima cobrança em{" "}
                  {new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")}
                </p>
              )}
              {sub?.cancelAtPeriodEnd && (
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Sua assinatura será cancelada no fim do ciclo atual.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Comparativo de planos para upgrade */}
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {usage.plan === "FREE" ? "Faça upgrade" : "Comparar planos"}
        </h3>
        <div className="grid gap-4 md:grid-cols-3">
          <PlanCard
            tier="FREE"
            current={usage.plan === "FREE"}
            ctaHref={usage.plan === "FREE" ? undefined : "#"}
            ctaLabel="Plano atual"
          />
          <PlanCard
            tier="PRO"
            highlighted={usage.plan !== "PRO"}
            current={usage.plan === "PRO"}
            ctaHref={
              usage.plan === "PRO" ? undefined : "/billing/checkout?plan=PRO"
            }
          />
          <PlanCard
            tier="PREMIUM"
            current={usage.plan === "PREMIUM"}
            ctaHref={
              usage.plan === "PREMIUM"
                ? undefined
                : "/billing/checkout?plan=PREMIUM"
            }
          />
        </div>
      </div>

      {sub && sub.plan !== "FREE" && (
        <Card>
          <CardHeader>
            <CardTitle>Gerenciar assinatura</CardTitle>
            <CardDescription>
              Acesse o portal do gateway pra ver faturas e atualizar método de pagamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openPortal}>
              Portal de pagamento <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </Button>
            {!sub.cancelAtPeriodEnd && (
              <Button
                variant="outline"
                onClick={() => setCancelOpen(true)}
                className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
              >
                Cancelar assinatura
              </Button>
            )}
            {sub.cancelAtPeriodEnd && (
              <p className="text-sm text-orange-600 dark:text-orange-400">
                Assinatura cancelada. Você mantém o acesso até{" "}
                {sub.currentPeriodEnd
                  ? new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")
                  : "o fim do ciclo"}
                .
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Você manterá o plano <strong>{PLAN_LABELS[usage.plan]}</strong> até o fim do ciclo
              atual. Depois, sua conta volta para o plano Free.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={cancelLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelLoading ? "Cancelando..." : "Cancelar assinatura"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="text-center text-xs text-muted-foreground">
        Dúvidas?{" "}
        <Link href="/precos" className="underline">
          Compare os planos
        </Link>
        .
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}
