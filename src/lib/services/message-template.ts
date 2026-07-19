import { ptBR } from "date-fns/locale";
import { APP_TIMEZONE, formatInTimeZone } from "@/lib/timezone";
import { CONFIRM_CODE, CANCEL_CODE } from "./webhook-parser";

type MessageData = {
  nome: string;
  data: string;
  hora: string;
  clinica: string;
};

export function formatMessage(template: string, data: MessageData): string {
  return template
    .replace(/{nome}/g, data.nome)
    .replace(/{data}/g, data.data)
    .replace(/{hora}/g, data.hora)
    .replace(/{clinica}/g, data.clinica);
}

// --- Instrução de resposta (bloco fixo, dono do sistema) --------------------
// Decisão de produto (2026-07-11): a linha "Responda 1 para CONFIRMAR ou 2 para
// CANCELAR." deixou de ser texto livre editável e passou a ser ANEXADA
// automaticamente pelo sistema. O template guardado no banco contém só o corpo
// livre; a instrução é adicionada no envio (scheduler) e na pré-visualização.
// Isso torna IMPOSSÍVEL o usuário instruir um número que o parser não aceita —
// o código sai sempre de CONFIRM_CODE/CANCEL_CODE (webhook-parser.ts).

/** Linha canônica anexada ao final de toda mensagem. Deriva do parser. */
export const RESPONSE_INSTRUCTION = `Responda ${CONFIRM_CODE} para CONFIRMAR ou ${CANCEL_CODE} para CANCELAR.`;

// Casa uma instrução de resposta embutida no texto (legado, migração parcial,
// ou digitada à mão pelo usuário). Tolerante a variações comuns: verbo
// (Responda/Digite/Envie/Mande/Responder), conector (ou/e/,) e QUALQUER número
// ou palavra no lugar dos códigos (\S+) — inclusive os errados ("2"/"5"). NÃO
// é ganancioso após CANCELAR: só consome o token imediatamente seguinte, para
// não engolir o resto da frase quando a instrução está no meio do texto.
const EMBEDDED_INSTRUCTION_RE =
  /\s*(?:responda|responder|digite|envie|mande)\s+\S+\s+para\s+confirmar\s+(?:ou|e|,)\s+\S+\s+para\s+cancelar\b\.?/gi;

/**
 * Remove a instrução de resposta embutida. O `\s*` no início da regex já
 * consome o espaço/quebra ANTES da instrução, então a remoção não deixa espaço
 * duplo — não precisamos de normalização global de whitespace (que reescreveria
 * a formatação deliberada do usuário: espaços duplos, linhas em branco). Só
 * `trim` nas pontas. Idempotente: sem instrução, devolve o texto (só trim).
 */
export function stripResponseInstruction(text: string): string {
  return text.replace(EMBEDDED_INSTRUCTION_RE, "").trim();
}

/**
 * Corpo livre → corpo + instrução canônica. Faz o strip antes de anexar, então
 * aplicar duas vezes NÃO duplica a instrução (idempotente) e um template legado
 * com a instrução errada embutida sai corrigido.
 */
export function withResponseInstruction(body: string): string {
  const clean = stripResponseInstruction(body);
  return clean ? `${clean}\n\n${RESPONSE_INSTRUCTION}` : RESPONSE_INSTRUCTION;
}

/**
 * Corpo livre → corpo + bloco do LINK de confirmação (Feature "Confirmação por
 * link"). Substitui o antigo `withResponseInstruction` no ENVIO: em vez de
 * "Responda 1/2", o paciente recebe um link que abre uma página de confirmação.
 * Faz o strip de qualquer instrução 1/2 legada embutida no corpo antes de
 * anexar. O parser 1/2 continua funcionando como fallback silencioso (webhook),
 * mas não é mais anunciado.
 */
export function withConfirmationLink(
  body: string,
  opts: { url: string; deadlineLabel: string },
): string {
  const clean = stripResponseInstruction(body).trim();
  const block =
    `Para confirmar ou cancelar, acesse:\n${opts.url}\n\n` +
    `Confirme até ${opts.deadlineLabel}, senão o agendamento será cancelado.`;
  return clean ? `${clean}\n\n${block}` : block;
}

export function formatAppointmentDate(dateTime: Date): string {
  return formatInTimeZone(dateTime, APP_TIMEZONE, "EEEE, d 'de' MMMM", {
    locale: ptBR,
  });
}

export function formatAppointmentTime(dateTime: Date): string {
  return formatInTimeZone(dateTime, APP_TIMEZONE, "HH:mm");
}
