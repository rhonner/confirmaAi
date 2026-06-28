// Lógica de casamento e retorno (ack) para respostas de pacientes no webhook
// da Evolution. Mantida fora do route handler para ser testável isoladamente
// (matcher contra o DB real em test:sprints; ack puro em vitest).

import { prisma } from "@/lib/prisma";
import { brPhoneCandidates } from "@/lib/phone";
import { formatAppointmentDate, formatAppointmentTime } from "./message-template";

/**
 * Encontra o agendamento PENDING que a resposta do paciente deve afetar.
 *
 * **FIFO (ordem em que as mensagens chegaram).** Quando o paciente tem vários
 * agendamentos com confirmação já enviada e responde "1"/"2" várias vezes
 * (caso real: a sócia agendou várias consultas de teste e respondeu todas),
 * cada resposta casa com a confirmação **mais antiga** ainda pendente —
 * batendo com a ordem em que ele lê/responde as mensagens (do topo para o fim
 * da conversa). Como o cron envia as confirmações priorizando a data mais
 * próxima primeiro (`orderBy dateTime asc` em `scheduler.ts`), o primeiro "1"
 * tende a confirmar a consulta mais próxima — o comportamento mais intuitivo.
 *
 * (Antes era LIFO — `confirmationSentAt desc` — que casava na ordem inversa à
 * leitura do paciente.)
 *
 * Multi-tenancy: scoped por `userId` (o mesmo telefone pode existir em
 * pacientes de tenants diferentes). `brPhoneCandidates` cobre o nono dígito
 * ausente em alguns JIDs do WhatsApp. O filtro `dateTime >= now` impede
 * confirmar um agendamento que já virou (ou vai virar) NO_SHOW.
 */
export function findPendingAppointmentForResponse(userId: string, phone: string) {
  return prisma.appointment.findFirst({
    where: {
      userId,
      patient: { phone: { in: brPhoneCandidates(phone) } },
      status: "PENDING",
      confirmationSentAt: { not: null },
      dateTime: { gte: new Date() },
    },
    // FIFO — ver doc acima. `dateTime`/`id` como desempate determinístico:
    // duas confirmações enviadas no mesmo lote do cron podem ter o mesmo
    // `confirmationSentAt`, e sem desempate o Postgres escolheria uma à toa.
    orderBy: [
      { confirmationSentAt: "asc" },
      { dateTime: "asc" },
      { id: "asc" },
    ],
    // Só id + dateTime são consumidos (status update + texto do ack); não
    // vendemos a linha inteira como contrato do helper.
    select: { id: true, dateTime: true },
  });
}

/**
 * Mensagem de retorno (ack) enviada ao paciente depois de registrar a resposta,
 * **nomeando o agendamento afetado** (dia + hora). Dá transparência: o paciente
 * sabe que a confirmação/cancelamento "pegou", e com vários agendamentos juntos
 * fica claro qual foi tratado a cada resposta. Não consome a cota de mensagens
 * do tenant (é resposta a um inbound, não disparo de campanha).
 */
export function buildConfirmationAck(
  responseType: "CONFIRMED" | "CANCELED",
  dateTime: Date,
): string {
  const data = formatAppointmentDate(dateTime); // "sábado, 27 de junho"
  const hora = formatAppointmentTime(dateTime); // "23:30"
  if (responseType === "CONFIRMED") {
    return `✅ Presença confirmada! Sua consulta de ${data} às ${hora} está marcada. Até lá! 🙂`;
  }
  return `❌ Sua consulta de ${data} às ${hora} foi cancelada. Se precisar remarcar, é só falar com a clínica.`;
}
