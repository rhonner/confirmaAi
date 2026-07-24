import { todayIsoInAppTz } from "@/lib/timezone";

/**
 * Aniversários — TUDO em cima de `Patient.birthDate`, que é uma **data civil em
 * string "yyyy-MM-dd"** (ver comentário no schema).
 *
 * Duas armadilhas que este módulo existe para matar:
 *
 * 1. **Fuso**: "hoje" no servidor (UTC na Vercel) vira o dia seguinte a partir
 *    das 21:00 BRT. Todo "hoje" aqui vem de `todayIsoInAppTz()` — nunca de
 *    `new Date().getDate()`. E `birthDate` NUNCA passa por `new Date()`: a
 *    comparação é de string, então não há conversão que possa deslizar um dia.
 * 2. **29 de fevereiro**: em ano não-bissexto a chave "02-29" simplesmente não
 *    existe no calendário. Sem tratamento, quem nasceu em 29/02 nunca
 *    apareceria. Regra adotada (prática civil brasileira): **antecipa para
 *    28/02**.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valida "yyyy-MM-dd" de verdade (rejeita 2026-02-30, 2026-13-01, etc.). */
export function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** "MM-DD" de uma data civil. */
export function monthDay(isoDate: string): string {
  return isoDate.slice(5, 10);
}

/**
 * A data `birthDate` faz aniversário no dia `todayIso`?
 * Trata 29/02 antecipando para 28/02 em ano não-bissexto.
 */
export function isBirthdayOn(birthDate: string, todayIso: string): boolean {
  if (!isValidIsoDate(birthDate) || !isValidIsoDate(todayIso)) return false;
  const born = monthDay(birthDate);
  const today = monthDay(todayIso);
  if (born === today) return true;
  const todayYear = Number(todayIso.slice(0, 4));
  return born === "02-29" && today === "02-28" && !isLeapYear(todayYear);
}

/** Idade completa em `onIso` (default: hoje no fuso do app). `null` se inválida. */
export function ageOn(birthDate: string, onIso: string = todayIsoInAppTz()): number | null {
  if (!isValidIsoDate(birthDate) || !isValidIsoDate(onIso)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ny, nm, nd] = onIso.split("-").map(Number);
  let age = ny - by;
  if (nm < bm || (nm === bm && nd < bd)) age -= 1;
  return age < 0 ? null : age;
}

/**
 * Quantos dias faltam para o próximo aniversário a partir de `todayIso`
 * (0 = é hoje). Ignora o ano de nascimento; 29/02 cai em 28/02 quando o próximo
 * ano não é bissexto. `null` se a data for inválida.
 */
export function daysUntilBirthday(birthDate: string, todayIso: string = todayIsoInAppTz()): number | null {
  if (!isValidIsoDate(birthDate) || !isValidIsoDate(todayIso)) return null;
  const todayUtc = Date.parse(`${todayIso}T00:00:00.000Z`);
  const year = Number(todayIso.slice(0, 4));
  for (const y of [year, year + 1]) {
    const target = occurrenceInYear(birthDate, y);
    const ms = Date.parse(`${target}T00:00:00.000Z`);
    if (ms >= todayUtc) return Math.round((ms - todayUtc) / 86_400_000);
  }
  return null;
}

/** A data em que o aniversário CAI num ano específico (resolve 29/02). */
export function occurrenceInYear(birthDate: string, year: number): string {
  const md = monthDay(birthDate);
  const yyyy = String(year).padStart(4, "0");
  if (md === "02-29" && !isLeapYear(year)) return `${yyyy}-02-28`;
  return `${yyyy}-${md}`;
}

/**
 * Data civil ISO → exibição brasileira. "1990-03-15" → "15/03/1990".
 * Fatia de string: nenhum `Date` envolvido, nenhum fuso para deslizar.
 */
export function isoToBr(isoDate: string | null | undefined): string {
  if (!isoDate || !ISO_DATE.test(isoDate)) return "";
  return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`;
}

/**
 * Exibição brasileira → data civil ISO. "15/03/1990" → "1990-03-15".
 * Devolve "" se ainda não há 8 dígitos (usuário digitando) ou se a data não
 * existe no calendário.
 */
export function brToIso(br: string | null | undefined): string {
  const digits = (br ?? "").replace(/\D/g, "");
  if (digits.length !== 8) return "";
  const iso = `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  return isValidIsoDate(iso) ? iso : "";
}

/**
 * Máscara progressiva de digitação: "1" → "1", "1503" → "15/03",
 * "15031990" → "15/03/1990". Mesmo padrão do CPF no formulário de paciente
 * (o projeto usa máscara em input de texto em vez de picker nativo — o dono
 * rejeitou o picker do Android; ver src/components/forms/time-select.tsx).
 */
export function maskBrDate(value: string): string {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

export type BirthdayPerson = {
  id: string;
  name: string;
  phone: string;
  birthDate: string;
};

/**
 * Separa quem faz aniversário HOJE e quem faz nos próximos `days` dias
 * (exclui hoje da segunda lista). Ordenado por proximidade e, em empate, nome.
 * Puro: recebe "hoje" para ser testável sem depender do relógio.
 */
export function splitBirthdays<T extends BirthdayPerson>(
  people: T[],
  todayIso: string,
  days = 7,
): { today: T[]; upcoming: Array<T & { inDays: number }> } {
  const today: T[] = [];
  const upcoming: Array<T & { inDays: number }> = [];
  for (const p of people) {
    if (!p.birthDate || !isValidIsoDate(p.birthDate)) continue;
    if (isBirthdayOn(p.birthDate, todayIso)) {
      today.push(p);
      continue;
    }
    const inDays = daysUntilBirthday(p.birthDate, todayIso);
    if (inDays !== null && inDays > 0 && inDays <= days) upcoming.push({ ...p, inDays });
  }
  const byName = (a: BirthdayPerson, b: BirthdayPerson) => a.name.localeCompare(b.name, "pt-BR");
  today.sort(byName);
  upcoming.sort((a, b) => a.inDays - b.inDays || byName(a, b));
  return { today, upcoming };
}
