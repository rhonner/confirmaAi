/**
 * Regra ÚNICA do agendamento RETROATIVO (2026-07-24, decisão do dono: "deve ser
 * possível agendar em dias/horários que já passaram simplesmente para
 * organização, mas que fique flaggeado").
 *
 * Um agendamento é retroativo quando o horário JÁ PASSOU no instante em que ele
 * é escrito (create, ou update que reescreve `dateTime`). O flag é gravado em
 * `Appointment.retroactive` e serve de firewall: o scheduler não manda WhatsApp
 * nem marca `NO_SHOW` automático nesses registros.
 *
 * ⚠️ Por que precisa ser PERSISTIDO e não derivado de `dateTime < now` na
 * leitura: um agendamento marcado para o futuro que simplesmente **passou** tem
 * de continuar sendo varrido pelo cron — é exatamente a falta que o produto
 * mede. O flag distingue "lancei no passado de propósito" de "passou do
 * horário". Ver .context/features/appointments.md § Retroativo.
 */
export function isRetroactive(dateTime: Date, now: Date = new Date()): boolean {
  // Estritamente MENOR: agendar para "agora" é um agendamento normal.
  return dateTime.getTime() < now.getTime();
}
