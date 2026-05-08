"use client";

import { useEffect, useRef } from "react";

/**
 * Carrega lazy o script do reCAPTCHA v3 e expõe `getToken(action)` que retorna
 * o token gerado pelo client.
 *
 * Em dev sem `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, retorna `null` — o backend
 * trata como bypass dev (ver `src/lib/anti-fraud/recaptcha.ts`).
 *
 * **Não recarrega o script em re-renders** (referência por window flag).
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
    __recaptchaLoading__?: Promise<void>;
  }
}

export function useRecaptcha() {
  const siteKeyRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    siteKeyRef.current = siteKey;
    if (!siteKey) return;
    if (typeof window === "undefined") return;
    if (window.grecaptcha) return;
    if (window.__recaptchaLoading__) return;

    window.__recaptchaLoading__ = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }, []);

  async function getToken(action: string): Promise<string | null> {
    const siteKey = siteKeyRef.current ?? process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (!siteKey) return null;
    if (typeof window === "undefined") return null;

    if (window.__recaptchaLoading__) await window.__recaptchaLoading__;
    if (!window.grecaptcha) return null;

    return new Promise((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window
          .grecaptcha!.execute(siteKey, { action })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  return { getToken };
}
