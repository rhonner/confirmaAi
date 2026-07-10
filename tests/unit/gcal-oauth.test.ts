import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  buildAuthUrl,
  decodeIdTokenEmail,
  exchangeCode,
  generatePkcePair,
  generateState,
  hasCalendarScope,
  isGoogleOAuthConfigured,
  packStateCookie,
  refreshAccessToken,
  statesMatch,
  verifyStateCookie,
  GoogleOAuthError,
  CALENDAR_EVENTS_READONLY_SCOPE,
} from "@/lib/services/google/oauth";

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "NEXT_PUBLIC_APP_URL",
  "GCAL_TOKEN_ENC_KEY",
  "NEXTAUTH_SECRET",
] as const;
const savedEnv: Record<string, string | undefined> = {};

function setTestConfig() {
  process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_OAUTH_REDIRECT_URI =
    "http://localhost:3000/api/integrations/google-calendar/callback";
  process.env.NEXTAUTH_SECRET = "nextauth-test-secret";
}

function fakeIdToken(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.assinatura-fake`;
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  setTestConfig();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe("generatePkcePair", () => {
  it("challenge é o SHA-256 base64url do verifier (S256)", () => {
    const { verifier, challenge } = generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("cada par é único", () => {
    expect(generatePkcePair().verifier).not.toBe(generatePkcePair().verifier);
  });
});

describe("generateState / statesMatch", () => {
  it("states são únicos e casam consigo mesmos", () => {
    const s = generateState();
    expect(s).not.toBe(generateState());
    expect(statesMatch(s, s)).toBe(true);
  });

  it("rejeita divergência, ausência e tamanhos diferentes", () => {
    expect(statesMatch(generateState(), generateState())).toBe(false);
    expect(statesMatch(undefined, "x")).toBe(false);
    expect(statesMatch("x", undefined)).toBe(false);
    expect(statesMatch("abc", "abcd")).toBe(false);
  });
});

describe("packStateCookie / verifyStateCookie (state vinculado ao usuário)", () => {
  it("roundtrip: cookie do próprio usuário valida", () => {
    const state = generateState();
    const cookie = packStateCookie(state, "user-a");
    expect(verifyStateCookie(cookie, state, "user-a")).toBe(true);
  });

  it("usuário diferente do iniciador NÃO valida (consent abandonado em browser compartilhado)", () => {
    const state = generateState();
    const cookie = packStateCookie(state, "user-a");
    expect(verifyStateCookie(cookie, state, "user-b")).toBe(false);
  });

  it("cookie forjado com outro userId sobre o mesmo state falha no HMAC", () => {
    const state = generateState();
    const [s] = packStateCookie(state, "user-a").split(".");
    const forged = packStateCookie(state, "user-a").replace(".user-a.", ".user-b.");
    expect(verifyStateCookie(forged, s, "user-b")).toBe(false);
  });

  it("state da URL divergente, cookie malformado ou ausente falham", () => {
    const state = generateState();
    const cookie = packStateCookie(state, "user-a");
    expect(verifyStateCookie(cookie, generateState(), "user-a")).toBe(false);
    expect(verifyStateCookie("so.duas", state, "user-a")).toBe(false);
    expect(verifyStateCookie(undefined, state, "user-a")).toBe(false);
    expect(verifyStateCookie(cookie, undefined, "user-a")).toBe(false);
  });

  it("sem NEXTAUTH_SECRET, empacotar lança (não assinar com chave vazia)", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => packStateCookie("s", "u")).toThrow(GoogleOAuthError);
  });
});

describe("buildAuthUrl", () => {
  it("monta a URL com PKCE S256, offline e prompt=consent", () => {
    const url = new URL(buildAuthUrl({ state: "st-1", codeChallenge: "ch-1" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(p.get("redirect_uri")).toContain("/api/integrations/google-calendar/callback");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("scope")).toContain(CALENDAR_EVENTS_READONLY_SCOPE);
    expect(p.get("scope")).toContain("email");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("state")).toBe("st-1");
    expect(p.get("code_challenge")).toBe("ch-1");
    expect(p.get("code_challenge_method")).toBe("S256");
  });

  it("lança sem credenciais configuradas", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(() => buildAuthUrl({ state: "s", codeChallenge: "c" })).toThrow(GoogleOAuthError);
  });
});

describe("isGoogleOAuthConfigured", () => {
  it("true com credenciais (chave de cifra coberta pelo runner de teste)", () => {
    expect(isGoogleOAuthConfigured()).toBe(true);
  });

  it("false sem client id/secret", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(isGoogleOAuthConfigured()).toBe(false);
  });

  it("deriva o redirect de NEXT_PUBLIC_APP_URL quando não explícito", () => {
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    expect(isGoogleOAuthConfigured()).toBe(true);
    const url = new URL(buildAuthUrl({ state: "s", codeChallenge: "c" }));
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/integrations/google-calendar/callback",
    );
  });
});

describe("decodeIdTokenEmail", () => {
  it("extrai o e-mail do payload", () => {
    expect(decodeIdTokenEmail(fakeIdToken({ email: "dr@clinica.com" }))).toBe("dr@clinica.com");
  });

  it("null para token ausente, malformado ou sem email", () => {
    expect(decodeIdTokenEmail(undefined)).toBeNull();
    expect(decodeIdTokenEmail("lixo")).toBeNull();
    expect(decodeIdTokenEmail("a.b")).toBeNull();
    expect(decodeIdTokenEmail(fakeIdToken({ sub: "123" }))).toBeNull();
  });
});

describe("hasCalendarScope", () => {
  it("detecta o escopo concedido (OAUTH-07)", () => {
    expect(hasCalendarScope(`openid email ${CALENDAR_EVENTS_READONLY_SCOPE}`)).toBe(true);
    expect(hasCalendarScope("openid email")).toBe(false);
    expect(hasCalendarScope("")).toBe(false);
  });
});

function mockTokenEndpoint(status: number, body: object) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("exchangeCode", () => {
  it("mapeia a resposta do token endpoint", async () => {
    const before = Date.now();
    mockTokenEndpoint(200, {
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: 3600,
      scope: `openid email ${CALENDAR_EVENTS_READONLY_SCOPE}`,
      id_token: fakeIdToken({ email: "dr@clinica.com" }),
    });
    const result = await exchangeCode({ code: "code-1", codeVerifier: "ver-1" });
    expect(result.accessToken).toBe("at-1");
    expect(result.refreshToken).toBe("rt-1");
    expect(result.email).toBe("dr@clinica.com");
    expect(hasCalendarScope(result.grantedScopes)).toBe(true);
    const delta = result.accessTokenExpiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(3500 * 1000);
    expect(delta).toBeLessThan(3700 * 1000);
  });

  it("refresh_token ausente vira null (guard OAUTH-04)", async () => {
    mockTokenEndpoint(200, { access_token: "at-1", expires_in: 3600, scope: "" });
    const result = await exchangeCode({ code: "c", codeVerifier: "v" });
    expect(result.refreshToken).toBeNull();
    expect(result.email).toBeNull();
  });

  it("invalid_grant vira GoogleOAuthError tipado", async () => {
    mockTokenEndpoint(400, { error: "invalid_grant", error_description: "code reutilizado" });
    await expect(exchangeCode({ code: "c", codeVerifier: "v" })).rejects.toMatchObject({
      name: "GoogleOAuthError",
      code: "INVALID_GRANT",
    });
  });

  it("resposta sem access_token é HTTP_ERROR", async () => {
    mockTokenEndpoint(200, { scope: "x" });
    await expect(exchangeCode({ code: "c", codeVerifier: "v" })).rejects.toMatchObject({
      code: "HTTP_ERROR",
    });
  });

  it("envia code_verifier e redirect_uri no corpo (PKCE)", async () => {
    const fetchMock = mockTokenEndpoint(200, { access_token: "at", expires_in: 60 });
    await exchangeCode({ code: "code-x", codeVerifier: "verifier-x" });
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code_verifier=verifier-x");
    expect(body).toContain("redirect_uri=");
  });
});

describe("refreshAccessToken", () => {
  it("renova e propaga rotação do refresh token", async () => {
    mockTokenEndpoint(200, { access_token: "at-2", expires_in: 3600, refresh_token: "rt-2" });
    const result = await refreshAccessToken("rt-1");
    expect(result.accessToken).toBe("at-2");
    expect(result.refreshToken).toBe("rt-2");
  });

  it("sem rotação, refreshToken é null", async () => {
    mockTokenEndpoint(200, { access_token: "at-2", expires_in: 3600 });
    expect((await refreshAccessToken("rt-1")).refreshToken).toBeNull();
  });

  it("grant revogado (OAUTH-06) lança INVALID_GRANT", async () => {
    mockTokenEndpoint(400, { error: "invalid_grant" });
    await expect(refreshAccessToken("rt-morto")).rejects.toMatchObject({
      code: "INVALID_GRANT",
    });
  });
});
