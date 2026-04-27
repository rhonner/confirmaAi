/**
 * RFC 4180 CSV escape: doublequote each field that contains comma, quote, or newline.
 */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const head = headers.map(csvEscape).join(",")
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n")
  // Add BOM so Excel opens UTF-8 correctly.
  return "﻿" + head + "\r\n" + body
}
