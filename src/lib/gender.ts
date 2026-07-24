import { Gender, Sex } from "@/generated/prisma/client";

/**
 * Sexo e identidade de gênero do paciente/cliente — fonte ÚNICA dos rótulos pt-BR.
 *
 * ⚠️ **São dois campos diferentes**, separados de propósito (esclarecimento do
 * dono, 2026-07-24):
 * - **Sexo** (`Patient.sex`): campo clínico. É o que importa para dosagem e
 *   faixas de referência de exame. Lista curta.
 * - **Identidade de gênero** (`Patient.gender` + `genderSelfDescribed`): como a
 *   pessoa se identifica e quer ser tratada. Lista ampla + autodescrição livre,
 *   porque nenhum enum finito atende "todos os que existem".
 *
 * Os dois são SEMPRE opcionais — nenhuma tela pode exigi-los. `NOT_INFORMED`
 * ("prefiro não informar") é diferente de `null` ("nunca preenchido").
 */

// ── Sexo (clínico) ────────────────────────────────────────────────────────────

export const SEX_LABELS: Record<Sex, string> = {
  FEMALE: "Feminino",
  MALE: "Masculino",
  INTERSEX: "Intersexo",
  NOT_INFORMED: "Prefiro não informar",
};

export const SEX_OPTIONS: Sex[] = ["FEMALE", "MALE", "INTERSEX", "NOT_INFORMED"];

export function formatSex(sex: Sex | null | undefined): string {
  return sex ? SEX_LABELS[sex] : "";
}

// ── Identidade de gênero ──────────────────────────────────────────────────────

export const GENDER_LABELS: Record<Gender, string> = {
  CIS_WOMAN: "Mulher cisgênero",
  CIS_MAN: "Homem cisgênero",
  TRANS_WOMAN: "Mulher trans",
  TRANS_MAN: "Homem trans",
  TRAVESTI: "Travesti",
  NON_BINARY: "Não binário",
  AGENDER: "Agênero",
  GENDERFLUID: "Gênero fluido",
  SELF_DESCRIBED: "Prefiro me autodescrever",
  NOT_INFORMED: "Prefiro não informar",
};

/** Ordem de exibição no `<select>` — as duas últimas são meta-opções. */
export const GENDER_OPTIONS: Gender[] = [
  "CIS_WOMAN",
  "CIS_MAN",
  "TRANS_WOMAN",
  "TRANS_MAN",
  "TRAVESTI",
  "NON_BINARY",
  "AGENDER",
  "GENDERFLUID",
  "SELF_DESCRIBED",
  "NOT_INFORMED",
];

export const GENDER_SELF_DESCRIBED_MAX = 60;

/** Texto para exibir/exportar. Autodescrição vence o rótulo genérico. */
export function formatGender(
  gender: Gender | null | undefined,
  selfDescribed?: string | null,
): string {
  if (!gender) return "";
  if (gender === "SELF_DESCRIBED") {
    const t = selfDescribed?.trim();
    return t ? t : GENDER_LABELS.SELF_DESCRIBED;
  }
  return GENDER_LABELS[gender];
}

/**
 * Normaliza o par (identidade, autodescrição) para gravar no banco.
 *
 * ⚠️ O `null` explícito importa: trocar "Prefiro me autodescrever" por outra
 * opção tem de APAGAR o texto anterior. Sem isso o banco guarda uma descrição de
 * identidade que o usuário acredita ter removido — quebra de expectativa de
 * privacidade, não só bug de dado. `undefined` seria omitido no
 * `JSON.stringify` do client e no spread do update.
 */
export function normalizeGender(input: {
  gender?: Gender | null;
  genderSelfDescribed?: string | null;
}): { gender: Gender | null; genderSelfDescribed: string | null } {
  const gender = input.gender ?? null;
  if (gender !== "SELF_DESCRIBED") return { gender, genderSelfDescribed: null };
  const t = (input.genderSelfDescribed ?? "").trim().slice(0, GENDER_SELF_DESCRIBED_MAX);
  return { gender, genderSelfDescribed: t.length > 0 ? t : null };
}
