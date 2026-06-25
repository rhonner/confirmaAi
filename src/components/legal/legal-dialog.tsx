"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  LEGAL_UPDATED_LABEL,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  type LegalSection,
} from "@/lib/legal/content";

/**
 * Termos de Uso / Política de Privacidade exibidos como **modal** (Bug report
 * 2026-06-24): clicar nos links no cadastro abria outra aba e quebrava o fluxo
 * (botão "voltar" levava ao login). O modal mantém o usuário na tela de cadastro
 * — melhor no mobile. As páginas públicas `/termos` e `/privacidade` continuam
 * existindo (rodapé, SEO, link direto). Fonte do conteúdo: `lib/legal/content.ts`.
 */
const DOCS: Record<"terms" | "privacy", { title: string; sections: LegalSection[] }> = {
  terms: { title: "Termos de Uso", sections: TERMS_SECTIONS },
  privacy: { title: "Política de Privacidade", sections: PRIVACY_SECTIONS },
};

export function LegalDialog({
  doc,
  children,
}: {
  doc: "terms" | "privacy";
  children: React.ReactNode;
}) {
  const { title, sections } = DOCS[doc];

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-1 border-b border-border px-6 py-4 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Última atualização: {LEGAL_UPDATED_LABEL}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-6 overflow-y-auto px-6 py-5">
          {sections.map((section) => (
            <section key={section.heading} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">
                {section.heading}
              </h3>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
