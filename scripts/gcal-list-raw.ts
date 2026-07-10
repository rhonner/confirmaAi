/**
 * Helper de dev (READ-ONLY, valida Fase C): lista os eventos ESPELHO (origem-app)
 * direto na Google Agenda do usuário-seed, usando o token da conexão — para
 * conferir create/patch/delete server-to-server (não pela UI). Filtra pela tag
 * privada confirmaaiOrigin=app (privateExtendedProperty), então só mostra o que
 * NÓS criamos. Imprime id, status, summary, start, description.
 *
 * Uso: npx tsx scripts/gcal-list-raw.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { decryptToken } from "../src/lib/services/google/token-crypto";
import { refreshAccessToken } from "../src/lib/services/google/oauth";

async function main() {
  const u = await prisma.user.findUnique({ where: { email: "rhonner.matheus@gmail.com" } });
  if (!u) throw new Error("seed user not found");
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId: u.id } });
  if (!conn) throw new Error("no google connection");

  const refresh = decryptToken(conn.refreshTokenEnc);
  const { accessToken } = await refreshAccessToken(refresh);

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendarId)}/events`,
  );
  url.searchParams.set("privateExtendedProperty", "confirmaaiOrigin=app");
  url.searchParams.set("showDeleted", "true"); // ver tombstones cancelados também
  url.searchParams.set("maxResults", "50");
  url.searchParams.set(
    "fields",
    "items(id,status,summary,description,start,end,extendedProperties)",
  );
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    items?: Array<{
      id?: string;
      status?: string;
      summary?: string;
      description?: string;
      start?: { dateTime?: string; date?: string };
      extendedProperties?: { private?: Record<string, string> };
    }>;
  };
  const items = json.items ?? [];
  console.log(`HTTP ${res.status} — ${items.length} evento(s) origem-app na agenda ${conn.calendarId}\n`);
  for (const e of items) {
    console.log(
      [
        `  status=${e.status}`,
        `summary=${JSON.stringify(e.summary)}`,
        `start=${e.start?.dateTime ?? e.start?.date}`,
        `desc=${JSON.stringify(e.description ?? null)}`,
        `apptId=${e.extendedProperties?.private?.confirmaaiAppointmentId}`,
        `id=${e.id?.slice(0, 16)}…`,
      ].join("  "),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
