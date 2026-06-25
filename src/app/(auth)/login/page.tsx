"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  // E-mail cuja conta existe mas ainda não foi confirmada (login bloqueado).
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setUnverifiedEmail(null);
    try {
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        // authorize() lança EmailNotVerifiedError ("EMAIL_NOT_VERIFIED") quando
        // a senha está certa mas o e-mail não foi confirmado.
        if (result.error.includes("EMAIL_NOT_VERIFIED")) {
          setUnverifiedEmail(data.email);
        } else {
          toast.error("Email ou senha incorretos");
        }
      } else if (result?.ok) {
        toast.success("Login realizado com sucesso");
        router.push("/dashboard");
      }
    } catch {
      toast.error("Erro ao fazer login. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setIsResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      // Anti-enumeration: a resposta é sempre genérica, então o toast também é.
      toast.success("E-mail de confirmação reenviado. Verifique a caixa de entrada e o spam.");
    } catch {
      toast.error("Não foi possível reenviar agora. Tente novamente em instantes.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Bem-vindo à Clínica Organizada</h1>
        <p className="text-muted-foreground">
          Entre com suas credenciais para acessar o sistema
        </p>
      </div>

      {unverifiedEmail && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          <div className="flex gap-3">
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="space-y-2">
              <p className="font-medium text-foreground">
                Confirme seu e-mail para entrar
              </p>
              <p className="text-muted-foreground">
                Enviamos um link de confirmação para{" "}
                <span className="font-medium text-foreground">{unverifiedEmail}</span>.
                Clique nele para ativar sua conta. Não recebeu?
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResend}
                disabled={isResending}
              >
                {isResending ? "Reenviando..." : "Reenviar e-mail de confirmação"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="seu@email.com"
            {...register("email")}
            disabled={isLoading}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link
              href="/esqueci-senha"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
              tabIndex={-1}
            >
              Esqueci a senha
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••"
            {...register("password")}
            disabled={isLoading}
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">Ainda não tem uma conta? </span>
        <Link
          href="/registro"
          className="font-medium text-primary hover:underline"
        >
          Criar conta
        </Link>
      </div>
    </div>
  );
}
