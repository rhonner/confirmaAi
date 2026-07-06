import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth-helpers";
import { check } from "@/lib/billing/entitlements";
import { audit, auditWrap, maskEmail } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import { encryptToken, decryptToken } from "@/lib/services/google/token-crypto";
import { revokeGoogleGrant } from "@/lib/services/google/revoke";
import {
  exchangeCode,
  hasCalendarScope,
  verifyStateCookie,
  GCAL_STATE_COOKIE,
  GCAL_VERIFIER_COOKIE,
} from "@/lib/services/google/oauth";

/**
 * GET /api/integrations/google-calendar/callback — retorno do consent do
 * Google. Valida `state` (cookie × query, anti-CSRF) e troca o code por
 * tokens usando o PKCE verifier do cookie. Sempre redireciona de volta para
 * /configuracoes com `?gcal=connected` ou `?gcal_error=<motivo>` — o card lê
 * o parâmetro, mostra o toast e limpa a URL.
 */
export const GET = auditWrap(async (request: NextRequest) => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  // Todo caminho de saída limpa os cookies efêmeros do fluxo.
  const redirectTo = (query: string) => {
    const res = NextResponse.redirect(new URL(`/configuracoes${query}`, baseUrl), 303);
    for (const name of [GCAL_STATE_COOKIE, GCAL_VERIFIER_COOKIE]) {
      res.cookies.set(name, "", { maxAge: 0, path: "/api/integrations/google-calendar" });
    }
    return res;
  };

  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return redirectTo("?gcal_error=session");
    }
    const userId = session.user.id;

    const params = request.nextUrl.searchParams;
    // Usuário negou o consent (ou o Google devolveu erro explícito).
    if (params.get("error")) {
      return redirectTo("?gcal_error=denied");
    }

    const stateCookie = request.cookies.get(GCAL_STATE_COOKIE)?.value;
    const verifier = request.cookies.get(GCAL_VERIFIER_COOKIE)?.value;
    const code = params.get("code");
    // O state do cookie é VINCULADO ao userId que iniciou o fluxo (HMAC) —
    // sessão diferente da que clicou em Conectar não completa o consent.
    if (!verifyStateCookie(stateCookie, params.get("state"), userId) || !verifier || !code) {
      return redirectTo("?gcal_error=state");
    }

    // Re-checa o gate: entre o connect e o consent o plano pode ter mudado.
    const decision = await check(userId, "gcal.connect");
    if (!decision.allowed) {
      return redirectTo("?gcal_error=plan");
    }

    const existing = await prisma.googleCalendarConnection.findUnique({ where: { userId } });

    const tokens = await exchangeCode({ code, codeVerifier: verifier });

    // Conta Google diferente da conexão existente? (usado nos dois branches
    // abaixo). Se algum e-mail é desconhecido, assume MESMA conta — revogar é
    // irreversível e mataria o grant inteiro do par conta+app.
    const isDifferentAccount =
      !!existing &&
      !!existing.googleAccountEmail &&
      !!tokens.email &&
      existing.googleAccountEmail !== tokens.email;

    // Escopo concedido ≠ solicitado (usuário desmarcou a agenda no consent —
    // cenário OAUTH-07): sem leitura de eventos a conexão é inútil. Revogar o
    // grant recém-criado (higiene) SÓ é seguro quando não derruba uma conexão
    // existente da MESMA conta — revogar um refresh token revoga o grant
    // inteiro do par conta+app, incluindo o token saudável já guardado.
    if (!hasCalendarScope(tokens.grantedScopes)) {
      if (!existing || isDifferentAccount) {
        await revokeGoogleGrant(tokens.refreshToken ?? tokens.accessToken);
      }
      return redirectTo("?gcal_error=scope");
    }

    // Sem refresh token não há conexão duradoura (cenário OAUTH-04; com
    // prompt=consent não deve ocorrer — guard defensivo).
    if (!tokens.refreshToken) {
      return redirectTo("?gcal_error=no_refresh");
    }

    // Troca de conta Google (red-team): revoga o grant ANTIGO apenas quando o
    // e-mail muda — nunca na reconexão da mesma conta (mataria o token novo).
    if (isDifferentAccount && existing) {
      try {
        await revokeGoogleGrant(decryptToken(existing.refreshTokenEnc));
      } catch (err) {
        // Blob ilegível (ex: chave rotacionada) não pode impedir a reconexão.
        await captureError(err, {
          area: "request",
          tenantUserId: userId,
          extra: { route: "gcal/callback/revoke-old" },
        });
      }
    }

    const data = {
      googleAccountEmail: tokens.email,
      refreshTokenEnc: encryptToken(tokens.refreshToken),
      accessTokenEnc: encryptToken(tokens.accessToken),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      scopes: tokens.grantedScopes,
      status: "CONNECTED" as const,
      lastError: null,
      connectedAt: new Date(),
      revokedAt: null,
    };
    await prisma.googleCalendarConnection.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    await audit({
      action: "gcal.connected",
      tenantUserId: userId,
      entityType: "GoogleCalendarConnection",
      entityId: userId,
      metadata: { email: tokens.email ? maskEmail(tokens.email) : null },
    });

    return redirectTo("?gcal=connected");
  } catch (error) {
    await captureError(error, { area: "request", extra: { route: "gcal/callback" } });
    return redirectTo("?gcal_error=internal");
  }
});
