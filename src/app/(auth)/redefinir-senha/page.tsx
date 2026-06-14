"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

const schema = z
  .object({
    password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").max(128),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

type Form = z.infer<typeof schema>;

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <div className="space-y-6 text-center">
        <div className="inline-flex p-3 rounded-full bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Link inválido</h1>
          <p className="text-muted-foreground">
            Este link de redefinição está incompleto. Peça um novo.
          </p>
        </div>
        <Link href="/esqueci-senha" className="inline-block text-sm font-medium text-primary hover:underline">
          Pedir novo link
        </Link>
      </div>
    );
  }

  const onSubmit = async (data: Form) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error || "Não foi possível redefinir a senha.");
        return;
      }
      toast.success("Senha redefinida! Faça login com a nova senha.");
      router.push("/login");
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Nova senha</h1>
        <p className="text-muted-foreground">Escolha uma nova senha para sua conta.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            {...register("password")}
            disabled={isLoading}
            aria-invalid={!!errors.password}
          />
          {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar nova senha</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="Repita a senha"
            {...register("confirm")}
            disabled={isLoading}
            aria-invalid={!!errors.confirm}
          />
          {errors.confirm && <p className="text-sm text-destructive">{errors.confirm.message}</p>}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Salvando..." : "Redefinir senha"}
        </Button>
      </form>

      <div className="text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
