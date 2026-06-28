// Brazilian phone helpers shared by client and server.
// Storage format (canonical): +5511999999999 (12 or 13 digits including +55).
// Display format: (11) 99999-9999 or (11) 9999-9999.

export const PHONE_REGEX = /^\+55\d{10,11}$/

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "")
}

/**
 * Strips +55 / 55 prefix and returns only the local digits (DDD + number).
 * Returns at most 11 digits.
 *
 * The "55" is treated as the country code (and stripped) when the value is
 * canonical — it carries an explicit "+" — OR when the digit string is long
 * enough that the leading 55 can only be the country code (> 11). A length
 * heuristic alone breaks the round-trip used by PhoneInput: `toCanonicalPhone`
 * prepends "+55", and while typing the canonical value is short (≤ 11 digits),
 * so a length-only check would NOT strip it, re-reading "55" as a DDD and
 * accumulating another "+55" on every keystroke (typing "1" → "(55) 1", etc.).
 * The "+" disambiguates a true country code from a DDD-55 number (e.g. Santa
 * Maria/RS) that the user typed without a "+".
 */
export function getLocalDigits(value: string): string {
  const hasPlus = value.trimStart().startsWith("+")
  let d = digitsOnly(value)
  if (d.startsWith("55") && (hasPlus || d.length > 11)) d = d.slice(2)
  return d.slice(0, 11)
}

/**
 * Formats a phone for display. Accepts canonical (+5511...), local digits, or partial input.
 * Returns "(11) 99999-9999" / "(11) 9999-9999" / progressive variants while typing.
 */
export function formatPhoneDisplay(value: string): string {
  const d = getLocalDigits(value)
  if (d.length === 0) return ""
  if (d.length <= 2) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

/**
 * Converts whatever format to canonical "+55XXXXXXXXXX". Returns "" if no digits.
 */
export function toCanonicalPhone(value: string): string {
  const d = getLocalDigits(value)
  if (d.length === 0) return ""
  return `+55${d}`
}

export function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(value)
}

/**
 * Returns the canonical phone plus its Brazilian ninth-digit variant.
 *
 * WhatsApp JIDs may omit the ninth digit for mobile numbers registered before
 * its rollout: a patient stored as +5541999999999 can reply from a JID of
 * 554199999999@s.whatsapp.net (and vice versa). Matching by a single exact
 * value silently drops those replies, so lookups must accept both forms.
 */
export function brPhoneCandidates(phone: string): string[] {
  const candidates = new Set<string>([phone])
  const match = phone.match(/^\+55(\d{2})(\d+)$/)
  if (match) {
    const [, ddd, rest] = match
    // Only mobile numbers carry the ninth digit; pre-rollout mobiles start
    // with 6-9. Landlines (2-5) never gain a 9, so no variant for them.
    if (rest.length === 8 && /^[6-9]/.test(rest)) {
      candidates.add(`+55${ddd}9${rest}`)
    } else if (rest.length === 9 && rest.startsWith("9") && /^[6-9]/.test(rest.slice(1))) {
      candidates.add(`+55${ddd}${rest.slice(1)}`)
    }
  }
  return [...candidates]
}
