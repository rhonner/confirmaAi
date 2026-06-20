import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { PRIVACY_SECTIONS } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "Política de Privacidade — Clínica Organizada",
  description: "Política de Privacidade da Clínica Organizada (LGPD).",
};

export default function PrivacidadePage() {
  return <LegalPage title="Política de Privacidade" sections={PRIVACY_SECTIONS} />;
}
