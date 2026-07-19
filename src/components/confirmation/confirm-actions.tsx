"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Result =
  | { kind: "confirmed" }
  | { kind: "canceled" }
  | { kind: "error"; message: string };

/**
 * Botões Confirmar / Cancelar da página pública de confirmação. A mutação é um
 * POST (nunca no carregamento da página) — ver /api/confirmar/[token].
 */
export function ConfirmActions({ token }: { token: string }) {
  const [pending, setPending] = useState<null | "CONFIRM" | "CANCEL">(null);
  const [result, setResult] = useState<Result | null>(null);

  async function act(action: "CONFIRM" | "CANCEL") {
    if (pending) return;
    setPending(action);
    try {
      const res = await fetch(`/api/confirmar/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => null);

      if (res.ok) {
        const status = body?.data?.status;
        setResult({ kind: status === "CONFIRMED" ? "confirmed" : "canceled" });
        return;
      }

      const err = body?.error as string | undefined;
      const messages: Record<string, string> = {
        EXPIRED: "O prazo para confirmar este agendamento já passou.",
        TOO_LATE: "Este horário já passou.",
        NOT_FOUND: "Não encontramos este agendamento.",
        INVALID: "Este link não é válido.",
        MALFORMED: "Este link não é válido.",
      };
      setResult({
        kind: "error",
        message: messages[err ?? ""] ?? "Não foi possível concluir. Tente novamente.",
      });
    } catch {
      setResult({
        kind: "error",
        message: "Falha de conexão. Verifique sua internet e tente de novo.",
      });
    } finally {
      setPending(null);
    }
  }

  if (result?.kind === "confirmed") {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <p className="text-lg font-semibold">Presença confirmada!</p>
        <p className="text-sm text-muted-foreground">
          Obrigado. Nos vemos no horário marcado. 🙂
        </p>
      </div>
    );
  }

  if (result?.kind === "canceled") {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <XCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-lg font-semibold">Agendamento cancelado</p>
        <p className="text-sm text-muted-foreground">
          Tudo certo. Se precisar remarcar, é só falar com a clínica.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {result?.kind === "error" && (
        <p className="text-center text-sm text-destructive">{result.message}</p>
      )}
      <Button
        size="lg"
        className="w-full"
        onClick={() => act("CONFIRM")}
        disabled={!!pending}
        aria-busy={pending === "CONFIRM"}
      >
        {pending === "CONFIRM" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="mr-2 h-4 w-4" />
        )}
        Confirmar presença
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="w-full"
        onClick={() => act("CANCEL")}
        disabled={!!pending}
        aria-busy={pending === "CANCEL"}
      >
        {pending === "CANCEL" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <XCircle className="mr-2 h-4 w-4" />
        )}
        Cancelar agendamento
      </Button>
    </div>
  );
}
