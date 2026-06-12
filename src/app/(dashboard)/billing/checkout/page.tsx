"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PLAN_LABELS, formatBRL } from "@/components/billing/plan-meta";
import { PLANS } from "@/lib/billing/plans";
import { useSubscription } from "@/hooks/use-api";

type CheckoutResponse = {
  sessionId: string;
  qrCodeBase64: string | null;
  qrCodePayload: string | null;
  paymentUrl: string | null;
  expiresAt: string | null;
  plan: "PRO" | "PREMIUM";
  method: "PIX" | "CREDIT_CARD";
};

export default function CheckoutPage() {
  const router = useRouter();
  const params = useSearchParams();
  const planParam = (params.get("plan") ?? "PRO").toUpperCase() as "PRO" | "PREMIUM";
  const [method, setMethod] = React.useState<"PIX" | "CREDIT_CARD">("PIX");
  const [checkout, setCheckout] = React.useState<CheckoutResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [polling, setPolling] = React.useState(false);

  const subQuery = useSubscription();

  const startCheckout = React.useCallback(
    async (m: "PIX" | "CREDIT_CARD") => {
      setLoading(true);
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: planParam, method: m }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json?.error || json?.message || "Erro ao criar checkout");
          return;
        }
        setCheckout(json.data);
        setPolling(true);
      } catch (e) {
        toast.error("Erro de rede");
      } finally {
        setLoading(false);
      }
    },
    [planParam],
  );

  // Poll status — quando subscription vira o plano-alvo ACTIVE, redireciona pra /sucesso.
  React.useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => {
      subQuery.refetch();
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, subQuery]);

  React.useEffect(() => {
    if (!polling || !subQuery.data) return;
    if (subQuery.data.plan === planParam && subQuery.data.status === "ACTIVE") {
      setPolling(false);
      router.push("/billing/sucesso");
    }
  }, [polling, subQuery.data, planParam, router]);

  // Mock-only: trigger fake payment
  const triggerMockPayment = async () => {
    const r = await fetch("/api/billing/mock-trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "PAYMENT_RECEIVED", plan: planParam }),
    });
    const j = await r.json();
    if (j.ok) {
      toast.success("Pagamento simulado processado");
      subQuery.refetch();
    } else {
      toast.error("Falha ao simular pagamento");
    }
  };

  const plan = PLANS[planParam];
  const isMock = process.env.NODE_ENV !== "production";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/billing"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Assinar plano {PLAN_LABELS[planParam]}</CardTitle>
          <CardDescription>
            {formatBRL(plan.priceMonthly)}/mês · cobrança recorrente · cancelamento a qualquer momento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!checkout && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={method === "PIX" ? "default" : "outline"}
                  onClick={() => setMethod("PIX")}
                  disabled={loading}
                >
                  Pix
                </Button>
                <Button
                  variant={method === "CREDIT_CARD" ? "default" : "outline"}
                  onClick={() => setMethod("CREDIT_CARD")}
                  disabled={loading}
                >
                  Cartão de crédito
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={() => startCheckout(method)}
                disabled={loading}
                data-testid="checkout-start"
              >
                {loading ? "Gerando..." : `Continuar com ${method === "PIX" ? "Pix" : "cartão"}`}
              </Button>
            </>
          )}

          {checkout && checkout.method === "PIX" && checkout.qrCodeBase64 && (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold">Escaneie o QR code Pix</p>
              <img
                src={`data:image/png;base64,${checkout.qrCodeBase64}`}
                alt="QR code Pix"
                className="mx-auto h-64 w-64 rounded border bg-white p-3"
                data-testid="checkout-qr"
              />
              {checkout.qrCodePayload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(checkout.qrCodePayload!);
                    toast.success("Código copiado");
                  }}
                >
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copiar código
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Após o pagamento, ativamos sua assinatura automaticamente.
              </p>
              {polling && <Skeleton className="h-2 w-full" />}
            </div>
          )}

          {checkout && checkout.method === "CREDIT_CARD" && checkout.paymentUrl && (
            <div className="space-y-3 text-center">
              <p className="text-sm">Redirecionando para o pagamento seguro...</p>
              <Button asChild className="w-full">
                <a href={checkout.paymentUrl}>Continuar para o pagamento</a>
              </Button>
            </div>
          )}

          {isMock && checkout && (
            <div className="border-t pt-4 mt-4 space-y-2">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-mono">
                [DEV] MockProvider — sem provider real.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={triggerMockPayment}
                data-testid="checkout-mock-pay"
              >
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
                Simular pagamento recebido
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
