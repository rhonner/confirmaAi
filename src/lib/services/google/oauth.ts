import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cliente OAuth 2.0 (authorization-code + PKCE) para a integração Google
 * Calendar. NÃO usa GoogleProvider do NextAuth — a conexão é um vínculo do
 * TENANT (User já autenticado por Credentials) com a agenda dele, não um
 * método de login. Ver .context/features/google-calendar.md.
 *
 * Nenhuma env var é lida no import (lazy): build e rotas que não tocam a
 * integração funcionam sem as credenciais configuradas.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** Escopo de LEITURA de eventos (Fase A/B — overlay). Grants legados têm só isto. */
export const CALENDAR_EVENTS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/calendar.events.readonly";

/**
 * Escopo de LEITURA+ESCRITA de eventos (Fase C — espelhar agendamentos no
 * Google). Inclui leitura, então SUBSTITUI o readonly no consent. Escopo mais
 * sensível → exige nova verificação OAuth do Google e re-consentimento de quem
 * já estava conectado (o grant antigo só tinha readonly).
 */
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** openid+email para identificar a conta Google conectada (exibida na UI). */
const REQUESTED_SCOPES = ["openid", "email", CALENDAR_EVENTS_SCOPE];

/** Cookies httpOnly de vida curta usados entre /connect e /callback. */
export const GCAL_STATE_COOKIE = "gcal_oauth_state";
export const GCAL_VERIFIER_COOKIE = "gcal_oauth_verifier";
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 600;

export type GoogleOAuthErrorCode = "INVALID_GRANT" | "HTTP_ERROR" | "NETWORK";

export class GoogleOAuthError extends Error {
  constructor(
    public code: GoogleOAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function readConfig(): OAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/integrations/google-calendar/callback`
      : undefined);
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

/**
 * Integração pronta para uso? Exige as credenciais OAuth E a chave de cifra
 * dos tokens — sem `GCAL_TOKEN_ENC_KEY` o callback quebraria no encryptToken
 * (erro fatal fora de testes, ver token-crypto.ts).
 */
export function isGoogleOAuthConfigured(): boolean {
  const hasEncKey =
    !!process.env.GCAL_TOKEN_ENC_KEY ||
    !!process.env.VITEST ||
    process.env.NODE_ENV === "test";
  return readConfig() !== null && hasEncKey;
}

function requireConfig(): OAuthConfig {
  const cfg = readConfig();
  if (!cfg) {
    throw new GoogleOAuthError(
      "HTTP_ERROR",
      "Integração Google Calendar não configurada (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI)",
    );
  }
  return cfg;
}

function base64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** `state` anti-CSRF: aleatório, guardado em cookie httpOnly e ecoado pelo Google. */
export function generateState(): string {
  return base64Url(randomBytes(32));
}

/** Par PKCE (RFC 7636, S256). O verifier fica em cookie httpOnly até o callback. */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Comparação constant-time do state (cookie × query). */
export function statesMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function signState(state: string, userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new GoogleOAuthError("HTTP_ERROR", "NEXTAUTH_SECRET ausente para assinar o state");
  }
  return createHmac("sha256", secret).update(`${state}.${userId}`).digest("base64url");
}

/**
 * Empacota o state VINCULADO ao userId iniciador (HMAC com NEXTAUTH_SECRET).
 * Sem o vínculo, num computador compartilhado o usuário B poderia completar o
 * consent abandonado do usuário A e linkar a agenda de A ao tenant de B
 * (cross-tenant leak — achado do code-review 2026-07-05). O HMAC impede
 * forjar o cookie para outro userId. `state` e `userId` (cuid) não contêm ".".
 */
export function packStateCookie(state: string, userId: string): string {
  return `${state}.${userId}.${signState(state, userId)}`;
}

/** Valida cookie × state da URL × usuário da sessão (tudo constant-time onde importa). */
export function verifyStateCookie(
  cookieValue: string | undefined,
  urlState: string | null | undefined,
  userId: string,
): boolean {
  if (!cookieValue || !urlState) return false;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [state, cookieUserId, sig] = parts;
  if (!statesMatch(state, urlState)) return false;
  if (cookieUserId !== userId) return false;
  return statesMatch(sig, signState(state, userId));
}

/**
 * URL de autorização. `access_type=offline` + `prompt=consent` garantem que o
 * Google SEMPRE devolve refresh_token no exchange (sem prompt=consent, um
 * segundo consent da mesma conta omite o refresh_token — cenário OAUTH-04).
 */
export function buildAuthUrl(params: { state: string; codeChallenge: string }): string {
  const cfg = requireConfig();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUESTED_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type TokenExchangeResult = {
  accessToken: string;
  /** Ausente se o Google não devolveu (guard OAUTH-04; com prompt=consent não deve ocorrer). */
  refreshToken: string | null;
  /** Instante absoluto de expiração do access token (com o relógio local). */
  accessTokenExpiresAt: Date;
  /** Escopos REALMENTE concedidos (podem diferir do solicitado — OAUTH-07). */
  grantedScopes: string;
  /** E-mail da conta Google, extraído do id_token (escopo email). */
  email: string | null;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<GoogleTokenResponse> {
  let res: Response;
  try {
    res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    throw new GoogleOAuthError("NETWORK", `Falha de rede no token endpoint do Google: ${err}`);
  }
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok) {
    // `invalid_grant` = refresh token revogado/expirado OU code reutilizado —
    // o chamador transiciona a conexão para NEEDS_RECONSENT.
    if (json.error === "invalid_grant") {
      throw new GoogleOAuthError("INVALID_GRANT", json.error_description ?? "invalid_grant");
    }
    throw new GoogleOAuthError(
      "HTTP_ERROR",
      `Token endpoint ${res.status}: ${json.error ?? "erro desconhecido"}`,
    );
  }
  return json;
}

/**
 * Extrai o e-mail do payload do id_token SEM verificar assinatura. Seguro aqui:
 * o token veio direto do token endpoint do Google via TLS (não de input do
 * usuário), e o e-mail é usado apenas como rótulo informativo na UI.
 */
export function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/**
 * Acesso de LEITURA à agenda concedido? Satisfeito por QUALQUER um dos escopos
 * de eventos — o write (`calendar.events`) inclui a leitura, e grants legados
 * têm só o readonly. Usado pelo guard de scope-mismatch do callback: sem isto,
 * ao trocar o pedido para o escopo de escrita, todo consent válido (que volta
 * `calendar.events`, não `...readonly`) seria falsamente rejeitado como scope.
 */
export function hasCalendarScope(grantedScopes: string): boolean {
  const scopes = grantedScopes.split(/\s+/);
  return scopes.includes(CALENDAR_EVENTS_SCOPE) || scopes.includes(CALENDAR_EVENTS_READONLY_SCOPE);
}

/**
 * Acesso de ESCRITA concedido? Só o escopo `calendar.events` (o readonly NÃO
 * dá escrita). O mirror da Fase C gateia por isto — grant legado só-leitura não
 * pode escrever (403 insufficientPermissions), então o mirror faz no-op até a
 * pessoa reconectar e re-consentir o escopo de escrita.
 */
export function hasWriteScope(grantedScopes: string): boolean {
  return grantedScopes.split(/\s+/).includes(CALENDAR_EVENTS_SCOPE);
}

function expiryFrom(expiresInSeconds: number | undefined): Date {
  // 3600s é o default do Google; desconta nada aqui — o consumidor aplica buffer.
  return new Date(Date.now() + (expiresInSeconds ?? 3600) * 1000);
}

/** Troca o authorization code por tokens (callback do OAuth). */
export async function exchangeCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<TokenExchangeResult> {
  const cfg = requireConfig();
  const json = await postToken({
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.codeVerifier,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
  });
  if (!json.access_token) {
    throw new GoogleOAuthError("HTTP_ERROR", "Token endpoint não devolveu access_token");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    accessTokenExpiresAt: expiryFrom(json.expires_in),
    grantedScopes: json.scope ?? "",
    email: decodeIdTokenEmail(json.id_token),
  };
}

export type TokenRefreshResult = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  /** O Google pode rotacionar o refresh token; persistir quando presente. */
  refreshToken: string | null;
};

/** Renova o access token a partir do refresh token. Lança INVALID_GRANT se revogado. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenRefreshResult> {
  const cfg = requireConfig();
  const json = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  if (!json.access_token) {
    throw new GoogleOAuthError("HTTP_ERROR", "Refresh não devolveu access_token");
  }
  return {
    accessToken: json.access_token,
    accessTokenExpiresAt: expiryFrom(json.expires_in),
    refreshToken: json.refresh_token ?? null,
  };
}
