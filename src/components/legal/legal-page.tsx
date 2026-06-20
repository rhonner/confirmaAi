import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { LEGAL_UPDATED_LABEL, type LegalSection } from "@/lib/legal/content";

/**
 * Shell público dos documentos legais (/termos, /privacidade), reusando o chrome
 * da página /precos. Renderiza as seções com tipografia manual (o projeto não
 * tem @tailwindcss/typography). Conteúdo vem de `src/lib/legal/content.ts`.
 */
export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold">
            Clínica Organizada
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/registro">Começar grátis</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </Link>

        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {LEGAL_UPDATED_LABEL}
        </p>

        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.heading} className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">{section.heading}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Clínica Organizada ·{" "}
          <Link href="/termos" className="hover:text-foreground">Termos</Link> ·{" "}
          <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
        </div>
      </footer>
    </div>
  );
}
