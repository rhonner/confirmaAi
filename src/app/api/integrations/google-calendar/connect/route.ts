import { NextRequest, NextResponse } from "next/server";
import {
  getAuthSession,
  unauthorizedResponse,
  serverErrorResponse,
  paywallResponse,
} from "@/lib/auth-helpers";
import { check } from "@/lib/billing/entitlements";
import { auditWrap } from "@/lib/audit";
import {
  isGoogleOAuthConfigured,
  generateState,
  generatePkcePair,
  buildAuthUrl,
  packStateCookie,
  GCAL_STATE_COOKIE,
  GCAL_VERIFIER_COOKIE,
  OAUTH_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/services/google/oauth";
import type { ApiResponse } from "@/lib/types/api";

type ConnectResponse = { authUrl: string };

/**
 * POST /api/integrations/google-calendar/connect — inicia o fluxo OAuth.
 * Devolve a URL de autorização do Google (o client faz `window.location.href`)
 * e planta `state` + PKCE verifier em cookies httpOnly de vida curta, que o
 * callback valida. Feature PREMIUM (gate server-side).
 */
export const POST = auditWrap(async (_request: NextRequest) => {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const decision = await check(session.user.id, "gcal.connect");
    if (!decision.allowed) return paywallResponse(decision);

    if (!isGoogleOAuthConfigured()) {
      return NextResponse.json<ApiResponse>(
        { error: "Integração com Google Calendar não está disponível no momento." },
        { status: 503 },
      );
    }

    const state = generateState();
    const { verifier, challenge } = generatePkcePair();
    const authUrl = buildAuthUrl({ state, codeChallenge: challenge });

    const res = NextResponse.json<ApiResponse<ConnectResponse>>({ data: { authUrl } });
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      // Só o callback precisa ler — não circula no resto do app.
      path: "/api/integrations/google-calendar",
      maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
    };
    // State vinculado ao userId (HMAC) — impede que outro usuário logado no
    // mesmo browser complete um consent abandonado e receba a agenda alheia.
    res.cookies.set(GCAL_STATE_COOKIE, packStateCookie(state, session.user.id), cookieOpts);
    res.cookies.set(GCAL_VERIFIER_COOKIE, verifier, cookieOpts);
    return res;
  } catch (error) {
    console.error("POST /api/integrations/google-calendar/connect error:", error);
    return serverErrorResponse();
  }
});
