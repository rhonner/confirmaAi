// Palavras/códigos que o paciente pode responder no WhatsApp. Estes arrays são
// a FONTE ÚNICA DA VERDADE dos códigos de resposta: o parser abaixo casa contra
// eles E a instrução de resposta anexada às mensagens (message-template.ts →
// RESPONSE_INSTRUCTION) deriva o código canônico do PRIMEIRO item de cada array.
// Assim é impossível o template instruir um número que o parser não aceita (ou
// que ele interpreta ao contrário) — o bug do "Responda 2 para CONFIRMAR ou 5
// para CANCELAR" reportado pela Claudia Estética. Ver .context/features/settings.md.
export const CONFIRM_KEYWORDS = ["1", "sim", "confirmo", "ok", "yes", "s"] as const;
export const CANCEL_KEYWORDS = ["2", "não", "nao", "cancelo", "cancelar", "cancel", "n"] as const;

/** Código canônico exibido ao paciente (1º item = o número). */
export const CONFIRM_CODE = CONFIRM_KEYWORDS[0]; // "1"
export const CANCEL_CODE = CANCEL_KEYWORDS[0]; // "2"

export function parseResponse(
  text: string
): "CONFIRMED" | "CANCELED" | null {
  const normalizedText = text.toLowerCase().trim();

  if ((CONFIRM_KEYWORDS as readonly string[]).includes(normalizedText)) {
    return "CONFIRMED";
  }

  if ((CANCEL_KEYWORDS as readonly string[]).includes(normalizedText)) {
    return "CANCELED";
  }

  return null;
}
