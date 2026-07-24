"use client";

import { Cake, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTerminology } from "@/hooks/use-terminology";
import { digitsOnly } from "@/lib/phone";

/**
 * Card "Aniversariantes do dia" (2026-07-24, pedido do dono: "só um card
 * gráfico na dashboard, em lugar de fácil visualização no início").
 *
 * Regras que este componente respeita:
 * - `birthDate` é **data civil** "yyyy-MM-dd": formatação por FATIA da string.
 *   `new Date(birthDate)` mostraria o dia anterior em BRT — ver src/lib/birthday.ts.
 * - Quem decide "hoje" é o servidor (`todayIsoInAppTz`), não o browser.
 * - **Nada é enviado automaticamente**: o botão abre o WhatsApp com o texto
 *   pronto para o dono revisar e mandar. Mensagem automática de parabéns
 *   consumiria a cota da confirmação (que previne falta = dinheiro) e é
 *   comunicação de marketing — risco de o número ser bloqueado.
 * - Terminologia por segmento (Paciente/Cliente) vem do hook, nunca hardcodada.
 */

type BirthdayToday = { id: string; name: string; phone: string; birthDate: string; age: number | null };
type BirthdayUpcoming = { id: string; name: string; phone: string; birthDate: string; inDays: number };

/** "1990-03-15" → "15/03". Fatia de string, sem Date (fuso não entra aqui). */
function dayMonth(isoDate: string): string {
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function whatsappLink(phone: string, name: string): string {
  const text = `Feliz aniversário, ${firstName(name)}! 🎉`;
  return `https://wa.me/${digitsOnly(phone)}?text=${encodeURIComponent(text)}`;
}

export function BirthdaysCard({
  today,
  upcoming,
  loading,
}: {
  today: BirthdayToday[];
  upcoming: BirthdayUpcoming[];
  loading?: boolean;
}) {
  const term = useTerminology();
  const plural = term.patient.plural.toLowerCase();

  return (
    <Card aria-busy={loading}>
      <CardHeader className="px-4 pb-3 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cake className="h-4 w-4 text-primary" />
          Aniversariantes de hoje
          {today.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {today.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {today.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {today.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.age !== null && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {p.age} anos
                    </span>
                  )}
                </div>
                <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
                  <a
                    href={whatsappLink(p.phone, p.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abre o WhatsApp com a mensagem pronta — você revisa e envia"
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                    Parabenizar
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum aniversário hoje.
          </p>
        )}

        {upcoming.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Próximos 7 dias
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <span className="text-foreground">{p.name}</span>{" "}
                  <span className="tabular-nums">{dayMonth(p.birthDate)}</span>
                  {p.inDays === 1 ? " (amanhã)" : ` (em ${p.inDays} dias)`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {today.length === 0 && upcoming.length === 0 && !loading && (
          <p className="mt-2 text-xs text-muted-foreground">
            Preencha a data de nascimento no cadastro dos seus {plural} para ver quem
            faz aniversário aqui.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
