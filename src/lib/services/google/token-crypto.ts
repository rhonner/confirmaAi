import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Cifra simétrica reversível (AES-256-GCM) para os tokens OAuth do Google
 * Calendar em repouso. Diferente de `identifiers.ts` (hash one-way de CPF/telefone),
 * aqui precisamos DECIFRAR o refresh token para chamar a API e para revogar o
 * grant no delete de conta (LGPD). Ver .context/features/google-calendar.md.
 *
 * Formato do blob: `g<versão>.` + base64( iv(12) || authTag(16) || ciphertext ).
 * O prefixo de versão permite rotação de chave sem invalidar blobs antigos:
 * ao rotacionar, mapear a versão → chave no `keyForVersion`.
 *
 * Chave via env `GCAL_TOKEN_ENC_KEY` (32 bytes, em hex de 64 chars OU base64).
 * Guard prod-missing igual ao `getPepper()` de identifiers.ts: em produção,
 * ausência é erro fatal; em dev/test cai numa chave de desenvolvimento fixa
 * (insegura, só para não travar o fluxo local), avisando uma vez.
 */

const CURRENT_VERSION = 1;
const IV_BYTES = 12; // nonce recomendado p/ GCM
const TAG_BYTES = 16;
const ALGO = "aes-256-gcm";

/** Deriva 32 bytes de uma string em hex(64) ou base64. */
function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "GCAL_TOKEN_ENC_KEY deve ter 32 bytes (64 hex chars ou base64 de 32 bytes)",
    );
  }
  return buf;
}

/** Chave para uma dada versão. Hoje só há a versão corrente; rotação estende aqui. */
function keyForVersion(version: number): Buffer {
  if (version !== CURRENT_VERSION) {
    throw new Error(`Versão de chave GCAL desconhecida: g${version}`);
  }
  const raw = process.env.GCAL_TOKEN_ENC_KEY;
  if (!raw) {
    // Fallback SÓ no runner de testes (vitest). Em QUALQUER outro ambiente
    // (dev, preview, staging, produção) a ausência é erro fatal — nunca proteger
    // um token real com uma chave conhecida derivada de constante do fonte.
    if (process.env.VITEST || process.env.NODE_ENV === "test") {
      return createHash("sha256").update("gcal-test-key").digest();
    }
    throw new Error("GCAL_TOKEN_ENC_KEY não está setado (obrigatório fora de testes)");
  }
  return decodeKey(raw);
}

/** Cifra um token (refresh/access) → blob string versionado, seguro para persistir. */
export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("encryptToken: plaintext vazio");
  }
  const key = keyForVersion(CURRENT_VERSION);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return `g${CURRENT_VERSION}.${packed.toString("base64")}`;
}

/** Decifra um blob produzido por `encryptToken`. Lança se adulterado/malformado. */
export function decryptToken(blob: string): string {
  if (typeof blob !== "string") {
    throw new Error("decryptToken: blob inválido");
  }
  const dot = blob.indexOf(".");
  if (dot < 2 || blob[0] !== "g") {
    throw new Error("decryptToken: formato de blob inválido");
  }
  const version = Number(blob.slice(1, dot));
  if (!Number.isInteger(version)) {
    throw new Error("decryptToken: versão de blob inválida");
  }
  const key = keyForVersion(version);
  const packed = Buffer.from(blob.slice(dot + 1), "base64");
  if (packed.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("decryptToken: blob truncado");
  }
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = packed.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
