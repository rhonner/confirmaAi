"use client";

import { useRef } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TemplateEditor,
  type TemplateEditorHandle,
  TEMPLATE_VARS,
  usesAnyVariable,
} from "@/components/settings/template-editor";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DollarSign, Save, History, ChevronRight } from "lucide-react";
import Link from "next/link";
import { WhatsappConnection } from "@/components/settings/whatsapp-connection";
import { ResetAccountCard } from "@/components/settings/reset-account-card";
import { AccountDataCard } from "@/components/settings/account-data-card";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/layout/page-header";
import { UnsavedChangesGuard } from "@/components/layout/unsaved-changes-guard";

const MESSAGE_MAX_LENGTH = 1000;

const settingsSchema = z
  .object({
    clinicName: z.string().min(3, "Nome da clínica deve ter pelo menos 3 caracteres").max(200),
    confirmationHoursBefore: z.number().min(1, "Mínimo de 1 hora").max(168, "Máximo de 7 dias (168 horas)"),
    reminderHoursBefore: z.number().min(1, "Mínimo de 1 hora").max(168, "Máximo de 7 dias (168 horas)"),
    confirmationMessage: z.string().min(10, "Template deve ter no mínimo 10 caracteres").max(MESSAGE_MAX_LENGTH, `Máximo de ${MESSAGE_MAX_LENGTH} caracteres`),
    reminderMessage: z.string().min(10, "Template deve ter no mínimo 10 caracteres").max(MESSAGE_MAX_LENGTH, `Máximo de ${MESSAGE_MAX_LENGTH} caracteres`),
    avgAppointmentValue: z.number().min(0, "Valor não pode ser negativo"),
  })
  .refine(
    (d) => d.reminderHoursBefore < d.confirmationHoursBefore,
    {
      message: "O lembrete deve ser enviado depois da confirmação (use uma antecedência menor)",
      path: ["reminderHoursBefore"],
    },
  );

type SettingsForm = z.infer<typeof settingsSchema>;

function formatTemplatePreview(template: string, clinicName?: string): string {
  const sampleDate = addDays(new Date(), 1);
  return template
    .replace(/\{nome\}/g, "Maria Silva")
    .replace(/\{data\}/g, format(sampleDate, "EEEE, dd 'de' MMMM", { locale: ptBR }))
    .replace(/\{hora\}/g, "14:30")
    .replace(/\{clinica\}/g, clinicName || "Sua Clínica");
}

/**
 * Pré-visualização do template. Verde quando há ao menos uma variável; amarela
 * com aviso quando nenhuma tag foi usada — a mensagem iria igual para todos os
 * pacientes (ideia da Isa, 2026-06-27). Não bloqueia o salvar, só alerta.
 */
function TemplatePreview({ value, clinicName }: { value: string; clinicName?: string }) {
  const hasVars = usesAnyVariable(value);
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        hasVars
          ? "border-green-500/20 bg-green-500/5"
          : "border-amber-500/40 bg-amber-500/10",
      )}
    >
      <p
        className={cn(
          "mb-1 text-xs font-medium",
          hasVars ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400",
        )}
      >
        Pré-visualização:
      </p>
      {!hasVars && (
        <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
          Nenhuma variável usada — a mensagem será enviada idêntica para todos os
          pacientes. Insira {"{nome}"}, {"{data}"} ou {"{hora}"} para personalizar.
        </p>
      )}
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {formatTemplatePreview(value, clinicName)}
      </p>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ConfiguracoesPage() {
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const defaultValues: SettingsForm = {
    clinicName: "",
    confirmationHoursBefore: 24,
    reminderHoursBefore: 6,
    confirmationMessage: "",
    reminderMessage: "",
    avgAppointmentValue: 0,
  };

  const confirmationEditorRef = useRef<TemplateEditorHandle | null>(null);
  const reminderEditorRef = useRef<TemplateEditorHandle | null>(null);
  const activeMessageRef = useRef<"confirmationMessage" | "reminderMessage">(
    "confirmationMessage",
  );

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isDirty },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
    values: settings ? {
      clinicName: settings.clinicName,
      confirmationHoursBefore: settings.confirmationHoursBefore,
      reminderHoursBefore: settings.reminderHoursBefore,
      confirmationMessage: settings.confirmationMessage,
      reminderMessage: settings.reminderMessage,
      avgAppointmentValue: settings.avgAppointmentValue,
    } : undefined,
  });

  const confirmationMessage = watch("confirmationMessage");
  const reminderMessage = watch("reminderMessage");

  const onSubmit = async (data: SettingsForm) => {
    await updateMutation.mutateAsync(data);
  };

  const insertVariable = (name: string) => {
    const target = activeMessageRef.current ?? "confirmationMessage";
    const handle =
      target === "confirmationMessage"
        ? confirmationEditorRef.current
        : reminderEditorRef.current;
    handle?.insertVariable(name);
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard when={isDirty} />
      <PageHeader
        title="Configurações"
        description="Gerencie as configurações do sistema"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Dados da Clínica */}
        <Card>
          <CardHeader>
            <CardTitle>Dados da clínica</CardTitle>
            <CardDescription>
              Aparece no header e nas mensagens enviadas aos pacientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clinicName">Nome da clínica</Label>
              <Input
                id="clinicName"
                placeholder="Clínica Saúde & Bem-estar"
                {...register("clinicName")}
                aria-invalid={!!errors.clinicName}
              />
              {errors.clinicName && (
                <p className="text-sm text-destructive">
                  {errors.clinicName.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Valor Médio da Consulta */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Valor Médio da Consulta
            </CardTitle>
            <CardDescription>
              Usado para calcular o prejuízo estimado por faltas no dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="avgAppointmentValue">Valor médio</Label>
              <Controller
                name="avgAppointmentValue"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    id="avgAppointmentValue"
                    placeholder="150,00"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.avgAppointmentValue}
                  />
                )}
              />
              {errors.avgAppointmentValue && (
                <p className="text-sm text-destructive">
                  {errors.avgAppointmentValue.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Exemplo: se sua consulta custa R$ 150, o dashboard calculará o prejuízo com base nas faltas
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Horários de Notificação */}
        <Card>
          <CardHeader>
            <CardTitle>Horários de Notificação</CardTitle>
            <CardDescription>
              Configure quando as notificações devem ser enviadas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="confirmationHoursBefore">
                Antecedência para confirmação (horas)
              </Label>
              <Input
                id="confirmationHoursBefore"
                type="number"
                min="1"
                max="168"
                placeholder="24"
                {...register("confirmationHoursBefore", { valueAsNumber: true })}
              />
              {errors.confirmationHoursBefore && (
                <p className="text-sm text-destructive">
                  {errors.confirmationHoursBefore.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Exemplo: 24 horas = enviar confirmação 1 dia antes
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reminderHoursBefore">
                Antecedência para lembrete (horas)
              </Label>
              <Input
                id="reminderHoursBefore"
                type="number"
                min="1"
                max="168"
                placeholder="6"
                {...register("reminderHoursBefore", { valueAsNumber: true })}
              />
              {errors.reminderHoursBefore && (
                <p className="text-sm text-destructive">
                  {errors.reminderHoursBefore.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Exemplo: 6 horas = enviar lembrete se não confirmou após 6h
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Templates de Mensagem */}
        <Card>
          <CardHeader>
            <CardTitle>Templates de Mensagem</CardTitle>
            <CardDescription>
              Personalize as mensagens enviadas aos pacientes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm font-medium mb-1">
                Variáveis disponíveis
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Utilize as tags abaixo para montar sua mensagem automática. Clique
                para inserir no template ativo (último focado) — elas são
                substituídas pelos dados de cada paciente no envio.
              </p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_VARS.map((name) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() => insertVariable(name)}
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {`{${name}}`}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  id="confirmationMessage-label"
                  htmlFor="confirmationMessage"
                  onClick={() => confirmationEditorRef.current?.focus()}
                >
                  Template de confirmação
                </Label>
                <span className={`text-xs ${(confirmationMessage?.length || 0) > MESSAGE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                  {confirmationMessage?.length || 0}/{MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <Controller
                name="confirmationMessage"
                control={control}
                render={({ field }) => (
                  <TemplateEditor
                    id="confirmationMessage"
                    ariaLabelledby="confirmationMessage-label"
                    ref={confirmationEditorRef}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onFocus={() => {
                      activeMessageRef.current = "confirmationMessage";
                    }}
                    placeholder="Olá {nome}! Você tem consulta agendada em {clinica} no dia {data} às {hora}. Confirma sua presença? Responda SIM ou NÃO."
                    invalid={!!errors.confirmationMessage}
                  />
                )}
              />
              {errors.confirmationMessage && (
                <p className="text-sm text-destructive">
                  {errors.confirmationMessage.message}
                </p>
              )}
              {confirmationMessage && confirmationMessage.length >= 10 && (
                <TemplatePreview value={confirmationMessage} clinicName={settings?.clinicName} />
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  id="reminderMessage-label"
                  htmlFor="reminderMessage"
                  onClick={() => reminderEditorRef.current?.focus()}
                >
                  Template de lembrete
                </Label>
                <span className={`text-xs ${(reminderMessage?.length || 0) > MESSAGE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                  {reminderMessage?.length || 0}/{MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <Controller
                name="reminderMessage"
                control={control}
                render={({ field }) => (
                  <TemplateEditor
                    id="reminderMessage"
                    ariaLabelledby="reminderMessage-label"
                    ref={reminderEditorRef}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onFocus={() => {
                      activeMessageRef.current = "reminderMessage";
                    }}
                    placeholder="Oi {nome}! Ainda não recebemos sua confirmação para a consulta de amanhã ({data} às {hora}). Confirma sua presença? Responda SIM ou NÃO."
                    invalid={!!errors.reminderMessage}
                  />
                )}
              />
              {errors.reminderMessage && (
                <p className="text-sm text-destructive">
                  {errors.reminderMessage.message}
                </p>
              )}
              {reminderMessage && reminderMessage.length >= 10 && (
                <TemplatePreview value={reminderMessage} clinicName={settings?.clinicName} />
              )}
            </div>
          </CardContent>
        </Card>

        <WhatsappConnection />

        {/* Barra de ações fixa no rodapé do form. A sócia preencheu os campos e
            saiu sem salvar por não notar o botão lá embaixo (2026-06-27): agora
            ele fica sempre à vista enquanto edita, com indicador de pendência. */}
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg border border-border bg-background/80 px-4 py-3 shadow-lg backdrop-blur-xl">
          {isDirty ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
              Alterações não salvas
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Tudo salvo</span>
          )}
          <Button
            type="submit"
            disabled={!isDirty || updateMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {updateMutation.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </form>

      <Link href="/configuracoes/atividade" className="block">
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <History className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Atividade da conta</p>
                <p className="text-sm text-muted-foreground">
                  Histórico de logins, alterações, mensagens e cobrança
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <ResetAccountCard />

      <AccountDataCard />
    </div>
  );
}
