// Extração de "sinais" de um evento do Google Calendar para pré-preencher o
// diálogo de promoção (Fase B). PURO (sem I/O) — usável no client e no server.
// Nada aqui é autoritativo: são sugestões que o usuário confirma/edita.
import { toCanonicalPhone, isValidPhone } from "@/lib/phone";

export type EventSignals = {
  /** Telefone canônico (+55...) achado no título/descrição, se válido. */
  suggestedPhone?: string;
  /** Nome candidato (título sem o telefone e sem prefixos de agenda). */
  suggestedName?: string;
  /** E-mail do 1º convidado, ou o 1º e-mail encontrado no texto. */
  suggestedEmail?: string;
};

// Sequência com cara de telefone BR: DDD (2) + [9?] + 4 + 4 dígitos, com
// separadores opcionais e "+55" opcional. O `isValidPhone` abaixo é o filtro
// real — a regex só localiza candidatos.
const PHONE_LIKE = /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g;
const EMAIL_LIKE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// Prefixos comuns de título de agenda que não fazem parte do nome do paciente.
// `(\s+|$)` cobre tanto "Consulta João" (vira "João") quanto o título que é só
// o prefixo — "Consulta" ou "Consulta 11 99999-8888" (após tirar o telefone
// sobra "Consulta") → vira "" (sem sugerir o prefixo como nome do paciente).
const AGENDA_PREFIX = /^(consulta|sess[aã]o|atendimento|retorno|avalia[cç][aã]o|reuni[aã]o)(\s+|$)/i;

/** Primeiro telefone BR *válido* encontrado no texto (canônico +55...), ou undefined. */
export function extractPhone(text: string): string | undefined {
  const matches = text.match(PHONE_LIKE);
  if (!matches) return undefined;
  for (const m of matches) {
    const canonical = toCanonicalPhone(m);
    if (isValidPhone(canonical)) return canonical;
  }
  return undefined;
}

export function parseEventSignals(input: {
  title?: string | null;
  description?: string | null;
  attendeeEmails?: string[];
  /**
   * Evento particular → título redigido; não extrair nome dele. Use SEMPRE este
   * booleano em vez de comparar o rótulo ("Ocupado"), que é copy e muda.
   */
  isPrivate?: boolean;
}): EventSignals {
  const title = (input.title ?? "").trim();
  const text = [title, input.description ?? ""].join("\n");
  const signals: EventSignals = {};

  const phone = extractPhone(text);
  if (phone) signals.suggestedPhone = phone;

  const email = input.attendeeEmails?.find((e) => EMAIL_LIKE.test(e)) ?? text.match(EMAIL_LIKE)?.[0];
  if (email) signals.suggestedEmail = email.toLowerCase();

  // Eventos privados chegam com o título redigido — não sugerir nome a partir dele.
  if (title && !input.isPrivate) {
    const name = title
      .replace(PHONE_LIKE, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .replace(AGENDA_PREFIX, "")
      .trim();
    if (name) signals.suggestedName = name;
  }

  return signals;
}
