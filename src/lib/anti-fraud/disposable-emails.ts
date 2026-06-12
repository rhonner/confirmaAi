/**
 * Blocklist de domínios de email descartável conhecidos.
 *
 * Lista enxuta com os mais usados em massa para fraude (mailinator,
 * tempmail, etc). Pode ser expandida importando da lib `disposable-email-domains`
 * (npm) — por ora hardcoded para evitar dep desnecessária.
 *
 * Reject domain match returns `false` para `isAllowed(email)`.
 */

const DISPOSABLE_DOMAINS = new Set([
  // Mailinator family
  "mailinator.com",
  "mailinator.net",
  "binkmail.com",
  "bobmail.info",
  "chammy.info",
  "devnullmail.com",
  "letthemeatspam.com",
  "mailinater.com",
  "mailinator2.com",
  "notmailinator.com",
  "reallymymail.com",
  "reconmail.com",
  "safetymail.info",
  "sendspamhere.com",
  "sogetthis.com",
  "spamherelots.com",
  "spamhereplease.com",
  "spamthisplease.com",
  "streetwisemail.com",
  "suremail.info",
  "thisisnotmyrealemail.com",
  "tradermail.info",
  "veryrealemail.com",
  "zippymail.info",

  // 10MinuteMail family
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",

  // Guerrilla / TempMail
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.de",
  "grr.la",
  "sharklasers.com",
  "spam4.me",

  // Outros conhecidos
  "tempmail.com",
  "temp-mail.org",
  "tempmail.de",
  "tempinbox.com",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.net",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "fakeinbox.com",
  "getnada.com",
  "nada.email",
  "maildrop.cc",
  "harakirimail.com",
  "dispostable.com",
  "mintemail.com",
  "mytemp.email",
  "tempinbox.xyz",
  "tmpmail.org",
  "tmpmail.net",
  "throwam.com",
  "burnermail.io",
]);

export function isDisposableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return DISPOSABLE_DOMAINS.has(domain);
}

export function disposableDomainCount(): number {
  return DISPOSABLE_DOMAINS.size;
}
