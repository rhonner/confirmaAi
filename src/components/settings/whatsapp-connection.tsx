"use client";

import { useState } from "react";
import {
  useWhatsappConnect,
  useWhatsappDisconnect,
  useWhatsappStatus,
} from "@/hooks/use-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

const POLL_INTERVAL_MS = 3000;

export function WhatsappConnection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrcodeBase64, setQrcodeBase64] = useState<string | null>(null);

  const status = useWhatsappStatus(dialogOpen ? POLL_INTERVAL_MS : false);
  const connect = useWhatsappConnect();
  const disconnect = useWhatsappDisconnect();

  // Auto-close: derive visibility from the "open" intent + live status,
  // so we never have to setState inside an effect.
  const isConnected = status.data?.status === "CONNECTED";
  const dialogVisible = dialogOpen && !isConnected;

  const handleConnect = async () => {
    setQrcodeBase64(null);
    setDialogOpen(true);
    const result = await connect.mutateAsync();
    setQrcodeBase64(result.qrcodeBase64);
  };

  const handleRefreshQr = async () => {
    const result = await connect.mutateAsync();
    setQrcodeBase64(result.qrcodeBase64);
  };

  const handleDisconnect = async () => {
    if (!confirm("Tem certeza? Você precisará escanear o QR code novamente.")) {
      return;
    }
    await disconnect.mutateAsync();
  };

  const isConnecting = status.data?.status === "CONNECTING";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexão WhatsApp</CardTitle>
        <CardDescription>
          Conecte seu WhatsApp pessoal escaneando o QR code. Cada estabelecimento usa seu próprio número.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : isConnecting ? (
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )}
            <div>
              {isConnected ? (
                <>
                  <p className="font-medium">Conectado</p>
                  <p className="text-sm text-muted-foreground">
                    {status.data?.phoneNumber ?? "Número conectado"}
                  </p>
                </>
              ) : isConnecting ? (
                <>
                  <p className="font-medium">Aguardando QR code...</p>
                  <p className="text-sm text-muted-foreground">
                    Escaneie o código no seu celular
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">WhatsApp não conectado</p>
                  <p className="text-sm text-muted-foreground">
                    Conecte para começar a enviar confirmações automáticas
                  </p>
                </>
              )}
            </div>
          </div>
          {isConnected ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleDisconnect}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? "Desconectando..." : "Desconectar"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleConnect();
              }}
              disabled={connect.isPending}
            >
              {connect.isPending ? "Iniciando..." : "Conectar WhatsApp"}
            </Button>
          )}
        </div>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Powered by Evolution API
        </p>
      </CardContent>

      <Dialog open={dialogVisible} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Escaneie o QR code</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no seu celular → Aparelhos conectados → Conectar um aparelho.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            {connect.isPending && !qrcodeBase64 ? (
              <div className="h-[260px] w-[260px] flex items-center justify-center border rounded-lg bg-muted/30">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : qrcodeBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrcodeBase64}
                alt="QR code do WhatsApp"
                className="h-[260px] w-[260px] border rounded-lg"
              />
            ) : (
              <div className="h-[260px] w-[260px] flex items-center justify-center border rounded-lg bg-muted/30 text-sm text-muted-foreground text-center px-4">
                QR code não disponível.<br />Tente atualizar.
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Status:{" "}
              <span className="font-medium">
                {status.data?.status === "CONNECTING"
                  ? "Aguardando leitura..."
                  : status.data?.status === "CONNECTED"
                    ? "Conectado!"
                    : "Pendente"}
              </span>
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRefreshQr}
              disabled={connect.isPending}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar QR
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
