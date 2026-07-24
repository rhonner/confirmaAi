"use client";

import { useEffect, useState } from "react";
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
import { AlertCircle, CalendarDays, CheckCircle2, RefreshCw, X } from "lucide-react";

/** Mensagens dos desfechos do callback OAuth (`?gcal=` / `?gcal_error=`). */
const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  denied: "Conexão cancelada no Google.",
  state:
    "O tempo do consentimento esgotou (a sessão de segurança expira em ~10 min). Conecte novamente e conclua sem demora.",
  plan: "Recurso disponível apenas no plano Premium.",
  scope:
    "Você concluiu o login sem autorizar o acesso à agenda. Conecte novamente e, na tela do Google, permita que a Clínica Organizada veja os eventos do seu Google Calendar.",
  no_refresh:
    "O Google não devolveu as credenciais esperadas. Remova o acesso da Clínica Organizada em myaccount.google.com/permissions e tente novamente.",
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
  // Erro do último callback OAuth, persistido no card (não só toast efêmero) —
  // senão a pessoa que erra o consentimento não vê o que aconteceu nem como refazer.
  const [callbackError, setCallbackError] = useState<string | null>(null);

  // Desfecho do callback OAuth: toast + mensagem persistente + limpa a URL (uma vez, no mount).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("gcal");
    const err = params.get("gcal_error");
    if (!ok && !err) return;
    if (ok === "connected") {
      toast.success("Google Agenda conectada! Seus eventos aparecem na agenda.");
      setCallbackError(null);
      queryClient.invalidateQueries({ queryKey: ["gcal-status"] });
      queryClient.invalidateQueries({ queryKey: ["gcal-events"] });
    } else if (err) {
      toast.error(CALLBACK_ERROR_MESSAGES[err] ?? CALLBACK_ERROR_MESSAGES.internal);
      setCallbackError(err);
    }
    params.delete("gcal");
    params.delete("gcal_error");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [queryClient]);

  // Reinicia o fluxo de conexão. NÃO limpa o erro persistido aqui: se o connect
  // falhar (sem redirect ao Google), a mensagem tem que continuar visível. O
  // sucesso redireciona e o callback volta com ?gcal=connected, que limpa no effect.
  const handleConnect = () => {
    connect.mutate();
  };

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
    // Desconectou com sucesso → some com um eventual alerta de erro antigo
    // (senão fica "Não foi possível conectar" ao lado de "não conectada").
    setCallbackError(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Google Agenda
        </CardTitle>
        <CardDescription>
          Veja seus eventos da Google Agenda aqui na Clínica Organizada e envie
          automaticamente para o Google tudo o que você marcar por aqui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {callbackError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-md border border-yellow-500/40 bg-yellow-50 p-3 text-sm dark:bg-yellow-950/30"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
            <div className="flex-1">
              <p className="font-medium">Não foi possível conectar</p>
              <p className="mt-0.5 text-muted-foreground">
                {CALLBACK_ERROR_MESSAGES[callbackError] ?? CALLBACK_ERROR_MESSAGES.internal}
              </p>
              {canStartConnect && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={handleConnect}
                  disabled={connect.isPending}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  {connect.isPending ? "Redirecionando..." : "Tentar novamente"}
                </Button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dispensar aviso"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setCallbackError(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
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
                  {data.mirrorActive ? (
                    <p className="mt-1 text-sm text-green-700 dark:text-green-500">
                      Tudo o que você agenda aqui aparece automaticamente nesta Google Agenda.
                    </p>
                  ) : data.needsWriteReconsent ? (
                    <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-500">
                      Reconecte para ativar o espelhamento dos seus agendamentos no Google.
                    </p>
                  ) : null}
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
            {/* Conectado só-leitura (grant legado): reconectar para conceder o
                escopo de escrita e ativar o espelhamento (Fase C). */}
            {isConnected && data.needsWriteReconsent && canStartConnect && !callbackError && (
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleConnect();
                }}
                disabled={connect.isPending}
              >
                {connect.isPending ? "Redirecionando..." : "Reconectar para ativar"}
              </Button>
            )}
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
            {/* Quando há erro de callback, o botão de refazer vive DENTRO do
                alerta ("Tentar novamente") — não duplicar aqui embaixo. */}
            {!isConnected && canStartConnect && !callbackError && (
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleConnect();
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
          Como funciona: os eventos que já existem na sua Google Agenda aparecem
          aqui só para você não marcar em cima deles — eles não recebem
          confirmação por WhatsApp. Os agendamentos que você cria na Clínica
          Organizada vão sozinhos para a sua Google Agenda principal (sem
          convidar nem notificar o paciente). Se você cancelar ou excluir um
          agendamento, o evento some de lá também.
        </p>
      </CardContent>
    </Card>
  );
}
