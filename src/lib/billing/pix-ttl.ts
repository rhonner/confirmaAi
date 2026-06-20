/**
 * TTL curto do QR Pix (Sprint 10 / fatia 2.5).
 *
 * O Asaas mantém o QR dinâmico válido por ~12 meses (não dá pra encurtar no
 * gateway). Então o "QR expira em N minutos" é política do NOSSO produto: o
 * checkout devolve um `expiresAt` curto (now + TTL) que dá ao front um countdown;
 * ao expirar, o usuário gera um novo QR (re-busca a cobrança Pix da assinatura
 * existente — NÃO cria assinatura nova). Calibrável por env.
 *
 * Pura e testável (espelha o padrão "primitiva pura + uso" do projeto).
 */
const _ttlRaw = Number(process.env.PIX_QR_TTL_SECONDS ?? 300);
// Guarda contra env não-numérica (evita expiresAt = Invalid Date / NaN no front).
export const PIX_QR_TTL_SECONDS = Number.isFinite(_ttlRaw) && _ttlRaw > 0 ? _ttlRaw : 300;

export function computePixExpiresAt(now: Date, ttlSeconds: number = PIX_QR_TTL_SECONDS): Date {
  return new Date(now.getTime() + ttlSeconds * 1000);
}
