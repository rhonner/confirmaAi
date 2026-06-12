import Link from "next/link";
import type { Metadata } from "next";
import { PlanCard } from "@/components/billing/plan-card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Planos e preços — Clínica Organizada",
  description:
    "Compare os planos da Clínica Organizada: Grátis (5 pacientes) e Pro (R$ 65/mês, pacientes ilimitados). Confirmação automática de agendamentos via WhatsApp para clínicas.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold">
            Clínica Organizada
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/registro">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </Link>

        <div className="mt-6 mb-12 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
            Planos simples, sem surpresa
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Comece grátis com 5 pacientes. Faça upgrade quando crescer.
          </p>
        </div>

        <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
          <PlanCard tier="FREE" ctaHref="/registro" ctaLabel="Começar grátis" />
          <PlanCard tier="PRO" highlighted ctaHref="/registro" ctaLabel="Começar com Pro" />
        </div>

        <div className="mt-12 mx-auto max-w-3xl space-y-6 text-sm text-muted-foreground">
          <FAQ q="Por que o limite de 5 pacientes no Free é vitalício e não mensal?">
            Porque a Clínica Organizada cobra por capacidade, não por consumo recorrente.
            Os 5 pacientes são pra você testar com clientes reais antes de assinar.
            Mesmo que você delete um paciente, a vaga não é liberada — isso evita
            burlar o limite criando e excluindo contas.
          </FAQ>
          <FAQ q="Por que o CPF é obrigatório no Free?">
            Para evitar criação massiva de contas de teste. O CPF é apenas hashed
            (SHA-256 com pepper) — nunca aparece em logs e não é compartilhado.
          </FAQ>
          <FAQ q="Posso cancelar a qualquer momento?">
            Sim. O cancelamento vale ao fim do ciclo atual; você mantém acesso até lá.
          </FAQ>
          <FAQ q="Como funciona a integração com WhatsApp?">
            Você conecta seu próprio número escaneando um QR code. Cada conta tem
            uma instância dedicada — sem mistura com outros clientes.
          </FAQ>
        </div>
      </main>

      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Clínica Organizada
        </div>
      </footer>
    </div>
  );
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-medium text-foreground">{q}</summary>
      <p className="mt-2">{children}</p>
    </details>
  );
}
