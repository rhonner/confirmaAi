import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, AlertCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Verificar email — ConfirmaAí",
  robots: { index: false },
};

type Status = "ok" | "expired" | "not_found" | "invalid" | undefined;

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as Status) ?? undefined;

  const variants: Record<NonNullable<Status>, {
    icon: typeof CheckCircle2;
    color: string;
    title: string;
    body: string;
    cta: { href: string; label: string };
  }> = {
    ok: {
      icon: CheckCircle2,
      color: "text-emerald-500",
      title: "Email confirmado!",
      body: "Sua conta está ativa. Você já pode entrar e cadastrar pacientes.",
      cta: { href: "/login", label: "Entrar" },
    },
    expired: {
      icon: AlertCircle,
      color: "text-amber-500",
      title: "Link expirado",
      body: "O link de confirmação expirou (válido por 24h). Faça login para receber um novo.",
      cta: { href: "/login", label: "Ir para login" },
    },
    not_found: {
      icon: AlertCircle,
      color: "text-red-500",
      title: "Link inválido",
      body: "Este link não é válido ou já foi usado. Se sua conta já está ativa, faça login.",
      cta: { href: "/login", label: "Ir para login" },
    },
    invalid: {
      icon: AlertCircle,
      color: "text-red-500",
      title: "Token ausente",
      body: "Não recebemos o token de verificação. Use o link enviado por email.",
      cta: { href: "/login", label: "Ir para login" },
    },
  };

  if (!status || !variants[status]) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <Mail className="h-12 w-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Verifique seu email</h1>
          <p className="text-muted-foreground">
            Enviamos um link de confirmação. Clique nele para ativar sua conta.
          </p>
          <p className="text-xs text-muted-foreground">
            Não chegou? Verifique sua pasta de spam ou faça login para receber outro.
          </p>
          <Button asChild>
            <Link href="/login">Ir para login</Link>
          </Button>
        </div>
      </div>
    );
  }

  const v = variants[status];
  const Icon = v.icon;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <Icon className={`h-12 w-12 ${v.color} mx-auto`} />
        <h1 className="text-2xl font-bold">{v.title}</h1>
        <p className="text-muted-foreground">{v.body}</p>
        <Button asChild>
          <Link href={v.cta.href}>{v.cta.label}</Link>
        </Button>
      </div>
    </div>
  );
}
