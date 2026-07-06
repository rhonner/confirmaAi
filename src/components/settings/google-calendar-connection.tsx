"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useGoogleCalendarConnect,
  useGoogleCalendarDisconnect,
  useGoogleCalendarStatus,
} from "@/hooks/use-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CalendarDays, CheckCircle2 } from "lucide-react";

/** Mensagens dos desfechos do callback OAuth (`?gcal=` / `?gcal_error=`). */
const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  denied: "Conexão cancelada no Google.",
  state: "A sessão do fluxo de conexão expirou. Tente conectar novamente.",
  plan: "Recurso disponível apenas no plano Premium.",
  scope:
    "A permissão de leitura da agenda não foi concedida. Marque o acesso ao Google Calendar na tela de consentimento.",
  no_refresh:
    "O Google não devolveu as credenciais esperadas. Remova o acesso do ConfirmaAí em myaccount.google.com/permissions e tente novamente.",
  session: "Sua sessão expirou durante a conexão. Faça login e tente de novo.",
  internal: "Erro inesperado ao conectar com o Google. Tente novamente.",
};

/**
 * Card "Google Agenda" em /configuracoes (feature PREMIUM, Fase A).
 * Espelha o padrão do WhatsappConnection: status + conectar/desconectar.
 * Fica INVISÍVEL quando o servidor não tem credenciais Google OU quando o
 * plano não dá acesso e não há conexão (PREMIUM está oculto da venda —
 * não anunciar feature que o usuário não pode comprar).
 */
export function GoogleCalendarConnection() {
  const status = useGoogleCalendarStatus();
  const connect = useGoogleCalendarConnect();
  const disconnect = useGoogleCalendarDisconnect();
  const queryClient = useQueryClient();

  // Desfecho do callback OAuth: toast + limpa a URL (uma vez, no mount).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("gcal");
    const err = params.get("gcal_error");
    if (!ok && !err) return;
    if (ok === "connected") {
      toast.success("Google Agenda conectada! Seus eventos aparecem na agenda.");
      queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
      queryClient.invalidateQueries({ queryKey: ["gcal-events"] });
    } else if (err) {
      toast.error(CALLBACK_ERROR_MESSAGES[err] ?? CALLBACK_ERROR_MESSAGES.internal);
    }
    params.delete("gcal");
    params.delete("gcal_error");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [queryClient]);

  const data = status.data;
  if (!data) return null;
  const isConnected = data.status === "CONNECTED";
  const needsReconsent = data.status === "NEEDS_RECONSENT";
  // DESCONECTADO + (sem credencial no servidor OU sem plano) → nada a mostrar
  // (nem upsell: PREMIUM é oculto da venda). Mas com conexão EXISTENTE o card
  // SEMPRE aparece — desconectar (teardown LGPD) não pode depender de plano
  // nem de o servidor ainda ter as credenciais Google configuradas.
  if (data.status === "DISCONNECTED" && (!data.configured || !data.allowed)) return null;
  // Conectar/Reconectar só quando o servidor está configurado e o plano permite.
  const canStartConnect = data.configured && data.allowed;

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Desconectar o Google Agenda? Os eventos do Google deixarão de aparecer na sua agenda.",
      )
    ) {
      return;
    }
    await disconnect.mutateAsync();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Google Agenda
        </CardTitle>
        <CardDescription>
          Veja os eventos do seu Google Calendar dentro da agenda do ConfirmaAí
          (somente leitura).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )}
            <div>
              {isConnected ? (
                <>
                  <p className="font-medium">Conectado</p>
                  <p className="text-sm text-muted-foreground">
                    {data.googleAccountEmail ?? "Conta Google conectada"}
                  </p>
                </>
              ) : needsReconsent ? (
                <>
                  <p className="font-medium">Reconexão necessária</p>
                  <p className="text-sm text-muted-foreground">
                    O acesso à sua agenda expirou ou foi revogado no Google
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Google Agenda não conectada</p>
                  <p className="text-sm text-muted-foreground">
                    Conecte para ver seus eventos do Google na agenda
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Desconectar disponível SEMPRE que existe conexão (inclusive em
                NEEDS_RECONSENT com plano rebaixado — senão o tenant fica preso
                com um grant que não consegue nem renovar nem revogar). */}
            {(isConnected || needsReconsent) && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? "Desconectando..." : "Desconectar"}
              </Button>
            )}
            {!isConnected && canStartConnect && (
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  connect.mutate();
                }}
                disabled={connect.isPending}
              >
                {connect.isPending
                  ? "Redirecionando..."
                  : needsReconsent
                    ? "Reconectar"
                    : "Conectar Google Agenda"}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Eventos do Google aparecem apenas como blocos de contexto — eles não
          recebem confirmações automáticas de WhatsApp.
        </p>
      </CardContent>
    </Card>
  );
}
