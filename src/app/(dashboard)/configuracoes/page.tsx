"use client";

import { useRef } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DollarSign, Save } from "lucide-react";
import { WhatsappConnection } from "@/components/settings/whatsapp-connection";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/layout/page-header";

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

  const confirmationRef = useRef<HTMLTextAreaElement | null>(null);
  const reminderRef = useRef<HTMLTextAreaElement | null>(null);
  const activeMessageRef = useRef<"confirmationMessage" | "reminderMessage">(
    "confirmationMessage",
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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

  const insertVariable = (
    field: "confirmationMessage" | "reminderMessage",
    variable: string,
  ) => {
    const ref = field === "confirmationMessage" ? confirmationRef : reminderRef;
    const textarea = ref.current;
    const current = (field === "confirmationMessage" ? confirmationMessage : reminderMessage) ?? "";
    if (!textarea) {
      setValue(field, current + variable, { shouldDirty: true });
      return;
    }
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const next = current.slice(0, start) + variable + current.slice(end);
    setValue(field, next, { shouldDirty: true });
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + variable.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="space-y-6">
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
                Clique para inserir no template ativo (último focado)
              </p>
              <div className="flex flex-wrap gap-2">
                {(["{nome}", "{data}", "{hora}", "{clinica}"] as const).map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => {
                      const target = activeMessageRef.current ?? "confirmationMessage";
                      insertVariable(target, v);
                    }}
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {v}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="confirmationMessage">
                  Template de confirmação
                </Label>
                <span className={`text-xs ${(confirmationMessage?.length || 0) > MESSAGE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                  {confirmationMessage?.length || 0}/{MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="confirmationMessage"
                rows={5}
                placeholder="Olá {nome}! Você tem consulta agendada em {clinica} no dia {data} às {hora}. Confirma sua presença? Responda SIM ou NÃO."
                {...register("confirmationMessage")}
                ref={(el) => {
                  register("confirmationMessage").ref(el);
                  confirmationRef.current = el;
                }}
                onFocus={() => {
                  activeMessageRef.current = "confirmationMessage";
                }}
              />
              {errors.confirmationMessage && (
                <p className="text-sm text-destructive">
                  {errors.confirmationMessage.message}
                </p>
              )}
              {confirmationMessage && confirmationMessage.length >= 10 && (
                <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Pré-visualização:</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {formatTemplatePreview(confirmationMessage, settings?.clinicName)}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="reminderMessage">Template de lembrete</Label>
                <span className={`text-xs ${(reminderMessage?.length || 0) > MESSAGE_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                  {reminderMessage?.length || 0}/{MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="reminderMessage"
                rows={5}
                placeholder="Oi {nome}! Ainda não recebemos sua confirmação para a consulta de amanhã ({data} às {hora}). Confirma sua presença? Responda SIM ou NÃO."
                {...register("reminderMessage")}
                ref={(el) => {
                  register("reminderMessage").ref(el);
                  reminderRef.current = el;
                }}
                onFocus={() => {
                  activeMessageRef.current = "reminderMessage";
                }}
              />
              {errors.reminderMessage && (
                <p className="text-sm text-destructive">
                  {errors.reminderMessage.message}
                </p>
              )}
              {reminderMessage && reminderMessage.length >= 10 && (
                <div className="rounded-lg border bg-green-500/5 border-green-500/20 p-3">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Pré-visualização:</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {formatTemplatePreview(reminderMessage, settings?.clinicName)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <WhatsappConnection />

        {/* Submit Button */}
        <div className="flex justify-end">
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
    </div>
  );
}
