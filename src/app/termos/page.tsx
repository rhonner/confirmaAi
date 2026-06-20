import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { TERMS_SECTIONS } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "Termos de Uso — Clínica Organizada",
  description: "Termos de Uso da Clínica Organizada.",
};

export default function TermosPage() {
  return <LegalPage title="Termos de Uso" sections={TERMS_SECTIONS} />;
}
