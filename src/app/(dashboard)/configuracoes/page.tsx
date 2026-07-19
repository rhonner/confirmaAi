"use client";

import { useRef } from "react";
import { useSession } from "next-auth/react";
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
import {
  stripResponseInstruction,
  withConfirmationLink,
} from "@/lib/services/message-template";
import { BUSINESS_TYPE_LABELS } from "@/lib/terminology";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DollarSign, Save, History, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";
import { WhatsappConnection } from "@/components/settings/whatsapp-connection";
import { GoogleCalendarConnection } from "@/components/settings/google-calendar-connection";
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
    // "" = ainda não definido (não é enviado no submit). Ver onSubmit.
    businessType: z.enum(["HEALTH", "AESTHETICS", "BEAUTY", "FINANCE", "OTHER"]).or(z.literal("")),
    confirmationHoursBefore: z.number().min(1, "Mínimo de 1 hora").max(168, "Máximo de 7 dias (168 horas)"),
    reminderHoursBefore: z.number().min(1, "Mínimo de 1 hora").max(168, "Máximo de 7 dias (168 horas)"),
    // min(10) no CORPO (sem a instrução de resposta, anexada automaticamente):
    // uma mensagem só-instrução vira "" após o strip → bloqueada; e um corpo
    // curto legado não trava o save. Espelha o schema do backend.
    confirmationMessage: z.string().max(MESSAGE_MAX_LENGTH, `Máximo de ${MESSAGE_MAX_LENGTH} caracteres`).refine((v) => stripResponseInstruction(v).length >= 10, "Template deve ter no mínimo 10 caracteres"),
    // reminderMessage saiu do form: o lembrete-nudge virou auto-cancelamento no
    // deadline (Confirmação por link). O campo segue no banco (não editado aqui).
    avgAppointmentValue: z.number().min(0, "Valor não pode ser negativo"),
  })
  .refine(
    (d) => d.reminderHoursBefore < d.confirmationHoursBefore,
    {
      message: "O prazo de cancelamento deve ser menor que a antecedência da confirmação",
      path: ["reminderHoursBefore"],
    },
  );

type SettingsForm = z.infer<typeof settingsSchema>;

function formatTemplatePreview(template: string, clinicName?: string): string {
  const sampleDate = addDays(new Date(), 1);
  const body = template
    .replace(/\{nome\}/g, "Maria Silva")
    .replace(/\{data\}/g, format(sampleDate, "EEEE, dd 'de' MMMM", { locale: ptBR }))
    .replace(/\{hora\}/g, "14:30")
    .replace(/\{clinica\}/g, clinicName || "Sua Clínica");
  // Espelha o envio real: o corpo livre + o bloco do LINK de confirmação
  // anexado pelo sistema (withConfirmationLink). O link e o prazo abaixo são
  // ilustrativos. Ver message-template.ts.
  const deadlineLabel = `${format(sampleDate, "EEEE, dd 'de' MMMM", { locale: ptBR })} às 08:30`;
  return withConfirmationLink(body, {
    url: "clinicaorganizada.com/confirmar/…",
    deadlineLabel,
  });
}

/**
 * Aviso fixo (não editável): o sistema anexa ao final da mensagem um LINK de
 * confirmação. O paciente clica, abre uma página e confirma/cancela ali — mais
 * claro que responder "1/2" (feedback do dono). Quem não confirmar até o prazo
 * (definido pela antecedência do lembrete) é cancelado automaticamente.
 * Ver .context/features/settings.md e features/appointments.md.
 */
function ConfirmationLinkNote() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed border-input bg-muted/40 px-3 py-2">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="text-xs text-muted-foreground">
          Adicionado automaticamente ao final (não editável):
        </p>
        <p className="text-sm font-medium">
          Um link para o paciente confirmar ou cancelar + o prazo.
        </p>
        <p className="text-xs text-muted-foreground">
          O paciente confirma numa página (não precisa responder com número). Se
          não confirmar até o prazo, o agendamento é cancelado automaticamente.
        </p>
      </div>
    </div>
  );
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
  const { update: updateSession } = useSession();

  const defaultValues: SettingsForm = {
    clinicName: "",
    businessType: "",
    confirmationHoursBefore: 24,
    reminderHoursBefore: 6,
    confirmationMessage: "",
    avgAppointmentValue: 0,
  };

  const confirmationEditorRef = useRef<TemplateEditorHandle | null>(null);

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
      businessType: (settings.businessType ?? "") as SettingsForm["businessType"],
      confirmationHoursBefore: settings.confirmationHoursBefore,
      reminderHoursBefore: settings.reminderHoursBefore,
      confirmationMessage: settings.confirmationMessage,
      avgAppointmentValue: settings.avgAppointmentValue,
    } : undefined,
  });

  const confirmationMessage = watch("confirmationMessage");

  const onSubmit = async (data: SettingsForm) => {
    // businessType "" = ainda não definido → não envia (o enum do backend
    // rejeitaria ""). Só vai no payload quando o usuário escolhe um ramo.
    const { businessType, ...rest } = data;
    await updateMutation.mutateAsync(businessType ? data : rest);
    // Atualiza o JWT/sessão na hora (trigger "update" força o callback jwt a
    // reler o banco) p/ o nome da clínica E o ramo (terminologia) refletirem já.
    await updateSession();
  };

  const insertVariable = (name: string) => {
    confirmationEditorRef.current?.insertVariable(name);
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

            <div className="space-y-2">
              <Label htmlFor="businessType">Ramo do negócio</Label>
              <select
                id="businessType"
                {...register("businessType")}
                className="h-10 w-full rounded-lg border border-input/20 bg-input/10 px-3 text-sm shadow-xs transition-all duration-200 outline-none focus-visible:border-primary/50 focus-visible:bg-input/20 focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="" disabled>
                  Selecione…
                </option>
                {(Object.keys(BUSINESS_TYPE_LABELS) as (keyof typeof BUSINESS_TYPE_LABELS)[]).map(
                  (bt) => (
                    <option key={bt} value={bt}>
                      {BUSINESS_TYPE_LABELS[bt]}
                    </option>
                  ),
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                Define como o sistema chama seus cadastrados (paciente ou cliente).
              </p>
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
            <CardTitle>Confirmação e prazo</CardTitle>
            <CardDescription>
              Quando enviar a confirmação e até quando o paciente pode confirmar
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
                Cancelar automaticamente se não confirmar (horas antes)
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
                Ex: 6 = se o paciente não confirmar até 6h antes da consulta, ela
                é <strong>cancelada automaticamente</strong> (e ele é avisado do
                prazo na mensagem). Envios de última hora ganham 2h de prazo mínimo.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Mensagem de confirmação */}
        <Card>
          <CardHeader>
            <CardTitle>Mensagem de confirmação</CardTitle>
            <CardDescription>
              Personalize a mensagem de confirmação enviada aos pacientes
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
                substituídas pelos dados de cada paciente no envio. Um link de
                confirmação (e o prazo) é adicionado automaticamente ao final —
                você não precisa digitá-lo.
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
                    placeholder="Olá {nome}! Você tem consulta agendada em {clinica} no dia {data} às {hora}. Confirma sua presença?"
                    invalid={!!errors.confirmationMessage}
                  />
                )}
              />
              {errors.confirmationMessage && (
                <p className="text-sm text-destructive">
                  {errors.confirmationMessage.message}
                </p>
              )}
              <ConfirmationLinkNote />
              {confirmationMessage && confirmationMessage.length >= 10 && (
                <TemplatePreview value={confirmationMessage} clinicName={settings?.clinicName} />
              )}
            </div>
          </CardContent>
        </Card>

        <WhatsappConnection />

        <GoogleCalendarConnection />

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
