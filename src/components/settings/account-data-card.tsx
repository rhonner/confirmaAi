"use client";

import * as React from "react";
import { useDeleteAccount } from "@/hooks/use-api";
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
import { Download, AlertTriangle } from "lucide-react";

const CONFIRM_WORD = "EXCLUIR";

/**
 * Card de dados da conta (LGPD): exportar dados + excluir conta (soft delete).
 * Export é um link direto pro endpoint (download via Content-Disposition).
 */
export function AccountDataCard() {
  const del = useDeleteAccount();
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Seus dados e sua conta (LGPD)
        </CardTitle>
        <CardDescription>
          Baixe uma cópia de todos os seus dados ou exclua sua conta permanentemente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-1">
          <Button asChild variant="outline" className="w-fit">
            <a href="/api/account/export" data-testid="account-export">
              <Download className="mr-2 h-3.5 w-3.5" />
              Exportar meus dados
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            Baixa um arquivo JSON com seus pacientes, agendamentos, mensagens e configurações.
          </p>
        </div>

        <div className="border-t pt-4 flex flex-col gap-1">
          <Button
            variant="destructive"
            className="w-fit"
            onClick={() => setOpen(true)}
            disabled={del.isPending}
            data-testid="account-delete-trigger"
          >
            Excluir minha conta
          </Button>
          <p className="text-xs text-muted-foreground">
            Anonimiza seus dados imediatamente e cancela sua assinatura. Os dados dos pacientes são
            apagados em definitivo após 30 dias. Esta ação é irreversível.
          </p>
        </div>
      </CardContent>

      <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setConfirm(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sua conta? Isto é irreversível.</AlertDialogTitle>
            <AlertDialogDescription>
              Sua conta será desativada e seus dados de identificação anonimizados agora. A
              assinatura é cancelada e os dados dos pacientes são apagados em até 30 dias. Digite{" "}
              <strong>{CONFIRM_WORD}</strong> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            data-testid="account-delete-confirm-input"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // signOut acontece no onSuccess
                del.mutate();
              }}
              disabled={confirm !== CONFIRM_WORD || del.isPending}
              data-testid="account-delete-confirm"
            >
              {del.isPending ? "Excluindo..." : "Excluir conta"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
