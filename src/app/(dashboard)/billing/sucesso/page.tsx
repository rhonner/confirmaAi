"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/use-api";
import { PLAN_LABELS } from "@/components/billing/plan-meta";

export default function CheckoutSuccessPage() {
  const sub = useSubscription();
  const plan = sub.data?.plan ?? "PRO";

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-12">
      <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto" />
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Pagamento confirmado!</h1>
        <p className="text-muted-foreground">
          Bem-vindo(a) ao plano <strong>{PLAN_LABELS[plan]}</strong>. Cadastre quantos pacientes precisar.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button asChild>
          <Link href="/pacientes">Ir para pacientes</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/billing">Ver detalhes da assinatura</Link>
        </Button>
      </div>
    </div>
  );
}
