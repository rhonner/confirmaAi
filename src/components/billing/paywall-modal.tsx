"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanCard } from "./plan-card";
import { Lock, AlertTriangle } from "lucide-react";

export type PaywallReason =
  | "QUOTA_EXCEEDED"
  | "PLAN_REQUIRED"
  | "PAYMENT_PAST_DUE"
  | "SUSPENDED"
  | "CPF_REQUIRED"
  | "EMAIL_NOT_VERIFIED"
  | "SOFT_NUDGE";

export type PaywallModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: PaywallReason;
  current?: number;
  limit?: number;
  /** Em "soft" o usuário pode fechar o modal (ex: aviso 4/5). Em "hard"
   *  só fecha clicando em CTA explícito (ex: 6º paciente). */
  variant?: "soft" | "hard";
  upgrade?: "PRO" | "PREMIUM";
};

const TITLES: Record<PaywallReason, { title: string; description: string }> = {
  QUOTA_EXCEEDED: {
    title: "Limite de pacientes atingido",
    description:
      "Você cadastrou todos os pacientes do plano Free. Faça upgrade para continuar.",
  },
  PLAN_REQUIRED: {
    title: "Recurso disponível em planos pagos",
    description: "Conheça os planos Pro e Premium para desbloquear esta funcionalidade.",
  },
  PAYMENT_PAST_DUE: {
    title: "Pagamento em atraso",
    description: "Regularize o pagamento para continuar usando o ConfirmaAí.",
  },
  SUSPENDED: {
    title: "Conta suspensa",
    description: "Sua assinatura está suspensa. Entre em contato com o suporte.",
  },
  CPF_REQUIRED: {
    title: "CPF é obrigatório no Free",
    description:
      "Para evitar fraude, o plano Free exige CPF do paciente. Adicione o CPF ou faça upgrade para Pro.",
  },
  EMAIL_NOT_VERIFIED: {
    title: "Confirme seu email para continuar",
    description:
      "Antes de cadastrar pacientes, valide seu email clicando no link que enviamos. Verifique também a pasta de spam.",
  },
  SOFT_NUDGE: {
    title: "Você está perto do limite",
    description:
      "Conheça os planos pagos para não ser interrompido quando atingir 5 pacientes.",
  },
};

export function PaywallModal({
  open,
  onOpenChange,
  reason,
  current,
  limit,
  variant = "soft",
  upgrade,
}: PaywallModalProps) {
  const meta = TITLES[reason];
  const isHard = variant === "hard";
  const Icon = isHard ? Lock : AlertTriangle;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // No "hard", impede fechar clicando fora — força CTA explícito.
        if (!next && isHard) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-3xl"
        showCloseButton={!isHard}
        data-testid="paywall-modal"
        data-paywall-variant={variant}
        data-paywall-reason={reason}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Icon
              className={
                isHard ? "h-5 w-5 text-red-500" : "h-5 w-5 text-orange-500"
              }
            />
            <DialogTitle>{meta.title}</DialogTitle>
          </div>
          <DialogDescription>
            {meta.description}
            {typeof current === "number" && typeof limit === "number" ? (
              <span className="block pt-1 text-xs">
                Uso atual: <strong>{current}/{limit}</strong> pacientes.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 mt-2">
          <PlanCard
            tier="PRO"
            highlighted={upgrade !== "PREMIUM"}
            ctaHref="/billing"
            ctaLabel="Assinar Pro"
          />
          <PlanCard
            tier="PREMIUM"
            highlighted={upgrade === "PREMIUM"}
            ctaHref="/billing"
            ctaLabel="Assinar Premium"
          />
        </div>

        {!isHard && (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mx-auto mt-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Continuar no Free por enquanto
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
