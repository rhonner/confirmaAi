import { describe, it, expect, afterEach, vi } from "vitest";
import { encryptToken, decryptToken } from "@/lib/services/google/token-crypto";

const ORIGINAL_KEY = process.env.GCAL_TOKEN_ENC_KEY;
const HEX_KEY_A = "a".repeat(64); // 32 bytes em hex
const HEX_KEY_B = "b".repeat(64);

afterEach(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL_KEY === undefined) delete process.env.GCAL_TOKEN_ENC_KEY;
  else process.env.GCAL_TOKEN_ENC_KEY = ORIGINAL_KEY;
});

describe("gcal token-crypto", () => {
  it("faz round-trip de um token", () => {
    const secret = "1//refresh-token-exemplo_abc.DEF-123";
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("emite blob versionado com prefixo g1.", () => {
    const blob = encryptToken("x");
    expect(blob.startsWith("g1.")).toBe(true);
  });

  it("usa IV aleatório por chamada (ciphertexts diferentes p/ mesmo texto)", () => {
    const a = encryptToken("mesmo-token");
    const b = encryptToken("mesmo-token");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("mesmo-token");
    expect(decryptToken(b)).toBe("mesmo-token");
  });

  it("detecta adulteração (auth tag GCM) e lança", () => {
    const blob = encryptToken("token-integro");
    // Flipa o último caractere do payload base64.
    const last = blob.slice(-1) === "A" ? "B" : "A";
    const tampered = blob.slice(0, -1) + last;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejeita blobs malformados", () => {
    expect(() => decryptToken("")).toThrow();
    expect(() => decryptToken("sem-prefixo")).toThrow();
    expect(() => decryptToken("g1.###")).toThrow();
    expect(() => decryptToken("g1.QUJD")).toThrow(); // curto demais p/ iv+tag
  });

  it("recusa plaintext vazio", () => {
    expect(() => encryptToken("")).toThrow();
  });

  it("aceita chave em hex de 64 chars via env", () => {
    process.env.GCAL_TOKEN_ENC_KEY = HEX_KEY_A;
    const blob = encryptToken("com-chave-hex");
    expect(decryptToken(blob)).toBe("com-chave-hex");
  });

  it("blob cifrado com chave A não decifra com chave B", () => {
    process.env.GCAL_TOKEN_ENC_KEY = HEX_KEY_A;
    const blob = encryptToken("segredo-cross-key");
    process.env.GCAL_TOKEN_ENC_KEY = HEX_KEY_B;
    expect(() => decryptToken(blob)).toThrow();
  });

  it("exige a chave fora do runner de testes (sem fallback inseguro)", () => {
    // Simula um ambiente não-teste (dev/preview/prod) sem a env var.
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.GCAL_TOKEN_ENC_KEY;
    expect(() => encryptToken("token-real")).toThrow(/GCAL_TOKEN_ENC_KEY/);
  });
});
