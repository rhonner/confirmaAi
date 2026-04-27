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
 */
export function getLocalDigits(value: string): string {
  let d = digitsOnly(value)
  if (d.startsWith("55") && d.length > 11) d = d.slice(2)
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
