"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { validateCpf, formatCpf, canonicalizeCpf } from "@/lib/anti-fraud/cpf-validator";
import { useRecaptcha } from "@/hooks/use-recaptcha";

const registerSchema = z.object({
  name: z.string().min(3, "O nome deve ter no mínimo 3 caracteres"),
  clinicName: z.string().min(3, "O nome da clínica deve ter no mínimo 3 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  cpf: z
    .string()
    .min(11, "CPF é obrigatório")
    .refine((v) => validateCpf(v).valid, { message: "CPF inválido" }),
  acceptedTerms: z.literal(true, { message: "É necessário aceitar os termos" }),
  // Honeypot — invisível, deve ficar vazio.
  website: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const recaptcha = useRecaptcha();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      cpf: "",
      clinicName: "",
      email: "",
      password: "",
      website: "",
    } as Partial<RegisterForm> as RegisterForm,
  });

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const recaptchaToken = await recaptcha.getToken("signup");

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          cpf: canonicalizeCpf(data.cpf),
          // Explicit: garantir que vai como boolean true (Controller pode
          // não incluir no `data` spread em alguns casos)
          acceptedTerms: data.acceptedTerms === true,
          recaptchaToken,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        const msg = result.error || result.message || "Erro ao criar conta";
        toast.error(msg);
        if (/cpf/i.test(msg)) setError("cpf", { type: "server", message: msg });
        if (/email/i.test(msg)) setError("email", { type: "server", message: msg });
        return;
      }

      toast.success(result.message ?? "Conta criada");
      // Sprint 4: usuário precisa verificar email antes de logar plenamente.
      // Direciona pra página de "verifique seu email" — auto-login só após verificação.
      router.push("/verificar-email");
    } catch (error) {
      console.error("register error:", error);
      toast.error("Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Criar Conta</h1>
        <p className="text-muted-foreground">
          Preencha os dados para começar a usar a Clínica Organizada
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Seu Nome</Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="João Silva"
            {...register("name")}
            disabled={isLoading}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cpf">Seu CPF</Label>
          <Controller
            name="cpf"
            control={control}
            render={({ field }) => (
              <Input
                id="cpf"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={field.value ?? ""}
                onChange={(e) => {
                  const digits = canonicalizeCpf(e.target.value).slice(0, 11);
                  field.onChange(digits.length === 11 ? formatCpf(digits) : digits);
                }}
                disabled={isLoading}
                aria-invalid={!!errors.cpf}
              />
            )}
          />
          {errors.cpf ? (
            <p className="text-sm text-destructive">{errors.cpf.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Necessário para anti-fraude. Não é compartilhado.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="clinicName">Nome da Clínica</Label>
          <Input
            id="clinicName"
            autoComplete="organization"
            placeholder="Clínica Saúde & Bem-estar"
            {...register("clinicName")}
            disabled={isLoading}
            aria-invalid={!!errors.clinicName}
          />
          {errors.clinicName && (
            <p className="text-sm text-destructive">{errors.clinicName.message}</p>
          )}
        </div>

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
          <Label htmlFor="password">Senha</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            {...register("password")}
            disabled={isLoading}
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-start gap-2">
          <Controller
            name="acceptedTerms"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="acceptedTerms"
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                disabled={isLoading}
                aria-invalid={!!errors.acceptedTerms}
              />
            )}
          />
          <div className="grid gap-1.5 leading-none">
            <label htmlFor="acceptedTerms" className="text-sm font-medium leading-none">
              Aceito os{" "}
              <Link href="/termos" className="underline" target="_blank">
                Termos de Uso
              </Link>{" "}
              e{" "}
              <Link href="/privacidade" className="underline" target="_blank">
                Política de Privacidade
              </Link>
            </label>
            {errors.acceptedTerms && (
              <p className="text-sm text-destructive">{errors.acceptedTerms.message}</p>
            )}
          </div>
        </div>

        {/* Honeypot — escondido visualmente e por aria. Bots preenchem; humanos não. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "-9999px",
            top: "-9999px",
            width: 0,
            height: 0,
            overflow: "hidden",
          }}
        >
          <label htmlFor="website-hp">Website (não preencher)</label>
          <input
            id="website-hp"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register("website")}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Criando conta..." : "Criar conta"}
        </Button>
      </form>

      <div className="text-center text-sm">
        <span className="text-muted-foreground">Já tem uma conta? </span>
        <Link href="/login" className="font-medium text-primary hover:underline">
          Fazer login
        </Link>
      </div>
    </div>
  );
}
