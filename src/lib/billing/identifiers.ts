import { createHash } from "node:crypto";
import type { IdentifierType } from "@/generated/prisma/client";
import { canonicalizeCpf } from "@/lib/anti-fraud/cpf-validator";

/**
 * Hashing determinístico de identificadores (CPF, telefone) para uso em
 * `PatientQuotaSlot.identifierHash` e `Patient.cpfHash`.
 *
 * Pepper global em `process.env.CPF_HASH_PEPPER` — rotacionar exige rehash de
 * toda a base. NÃO usar a string vazia em produção.
 */

function getPepper(): string {
  const pepper = process.env.CPF_HASH_PEPPER;
  if (!pepper) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CPF_HASH_PEPPER não está setado em produção");
    }
    return "";
  }
  return pepper;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Apenas dígitos do telefone, sem `+`/espaços/traços. Ex: `+55 (11) 99999-0001` → `5511999990001`. */
export function canonicalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function hashCpf(cpf: string): string {
  // Namespace `cpf:` previne colisão com phone do mesmo formato numérico.
  return sha256("cpf:" + canonicalizeCpf(cpf) + ":" + getPepper());
}

/** Hash do CNPJ — namespace próprio `cnpj:` (14 dígitos não colidem com CPF/phone). */
export function hashCnpj(cnpj: string): string {
  return sha256("cnpj:" + cnpj.replace(/\D/g, "") + ":" + getPepper());
}

/**
 * Hash do **documento do dono** (CPF ou CNPJ), usado no anti-fraude do signup/
 * checkout (`User.cpfHash`). Despacha por tamanho: ≤11 dígitos → `hashCpf`
 * (mesmo namespace `cpf:` → hashes de CPF já gravados continuam batendo), >11 →
 * `hashCnpj`. NÃO usar pra paciente (lá é só CPF, via `hashCpf`/`primaryIdentifier`).
 */
export function hashDocument(doc: string): string {
  const digits = doc.replace(/\D/g, "");
  return digits.length > 11 ? hashCnpj(digits) : hashCpf(digits);
}

export function hashPhone(phone: string): string {
  return sha256("phone:" + canonicalizePhone(phone) + ":" + getPepper());
}

/**
 * Resolve qual identificador será usado como **primary** para o slot do
 * paciente: CPF se presente, senão phone. Retorna o `IdentifierType` e o hash.
 */
export function primaryIdentifier(input: {
  cpf?: string | null;
  phone: string;
}): { type: IdentifierType; hash: string } {
  if (input.cpf) {
    return { type: "CPF", hash: hashCpf(input.cpf) };
  }
  return { type: "PHONE", hash: hashPhone(input.phone) };
}

/**
 * Lista TODOS os hashes que podem identificar um paciente (CPF + phone).
 * Útil em lookups de slot existente: tentamos match em qualquer um deles
 * antes de criar slot novo (para reaproveitar slot órfão).
 */
export function allIdentifiers(input: {
  cpf?: string | null;
  phone: string;
}): Array<{ type: IdentifierType; hash: string }> {
  const out: Array<{ type: IdentifierType; hash: string }> = [];
  if (input.cpf) out.push({ type: "CPF", hash: hashCpf(input.cpf) });
  if (input.phone) out.push({ type: "PHONE", hash: hashPhone(input.phone) });
  return out;
}
