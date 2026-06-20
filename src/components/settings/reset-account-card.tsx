"use client";

import * as React from "react";
import { useSubscription, useResetAccount } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

const CONFIRM_WORD = "RESETAR";

/**
 * Card destrutivo de "Resetar conta Free" — só aparece no plano FREE. Apaga
 * todos os pacientes e zera a quota vitalícia. Disponível 1× e só em conta sem
 * agendamentos (gate `canResetFreeAccount` vindo da subscription; backend revalida).
 */
export function ResetAccountCard() {
  const { data: sub } = useSubscription();
  const reset = useResetAccount();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");

  // Só faz sentido no Free (pago é ilimitado). Esconde nos demais.
  if (!sub || sub.plan !== "FREE") return null;

  const canReset = sub.canResetFreeAccount;

  const handleConfirm = async () => {
    await reset.mutateAsync();
    setOpen(false);
    setConfirm("");
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Resetar minha conta
        </CardTitle>
        <CardDescription>
          Apaga <strong>todos os seus pacientes</strong> e libera as vagas do plano Free. Use só se
          você cadastrou pacientes apenas para testar. Disponível <strong>uma única vez</strong> e
          somente enquanto a conta não tem agendamentos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          disabled={!canReset || reset.isPending}
          onClick={() => setOpen(true)}
          data-testid="reset-account-trigger"
        >
          Resetar minha conta
        </Button>
        {!canReset && (
          <p className="mt-2 text-xs text-muted-foreground">
            Indisponível: sua conta já tem agendamentos ou você já usou o reset gratuito.
          </p>
        )}
      </CardContent>

      <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza? Isto é irreversível.</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os seus pacientes (e o histórico de agendamentos/mensagens deles) serão
              apagados permanentemente, e suas vagas do plano Free voltam ao zero. Esta ação só pode
              ser feita uma vez. Digite <strong>{CONFIRM_WORD}</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_WORD}
            data-testid="reset-account-confirm-input"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reset.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // não fecha automaticamente — fechamos no sucesso
                handleConfirm();
              }}
              disabled={confirm !== CONFIRM_WORD || reset.isPending}
              data-testid="reset-account-confirm"
            >
              {reset.isPending ? "Resetando..." : "Resetar conta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
