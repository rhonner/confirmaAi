# Marca — Clínica Organizada

> SaaS que **reduz faltas** com confirmação automática de agendamentos via WhatsApp, para clínicas, psicólogos, dentistas, estética e salões.

## Logo — "Agenda Viva"

Um **calendário** (agenda organizada) cujo cabeçalho é um **batimento cardíaco** (saúde / "viva"), com um **check** de confirmação. Conta a história do produto numa marca só: *confirmar agendamentos reduz faltas*.

| Uso | Arquivo |
| --- | ------- |
| Componente no app (adapta light/dark) | `src/components/brand/logo-mark.tsx` (`<LogoMark className="h-8 w-8 text-primary" />`) |
| Favicon do browser | `src/app/icon.svg` (Next App Router detecta sozinho) |
| Standalone full-color (e-mails, docs, kit) | `public/brand/logo-mark.svg` |

**Construção:** o calendário/abas/pulso usam `currentColor` (controle por `text-primary` → cyan no claro, cyan-claro no escuro); o **check é verde fixo** `#10b981` (legível nos dois fundos). Lockup = marca + "Clínica **Organizada**" (Organizada destacada na cor primária).

## Paleta (mantida — já no `globals.css`)

| Papel | Claro | Escuro | Hex |
| ----- | ----- | ------ | --- |
| Primária (cyan) | ✓ | | `#0891b2` |
| Primária (dark) | | ✓ | `#22d3ee` |
| Check / sucesso (logo) | ✓ | ✓ | `#10b981` |
| CTA / verde de ação | ✓ | | `#059669` |
| Texto / "ink" | ✓ | | `#164e63` |
| Fundo claro | ✓ | | `#ecfeff` |
| Fundo escuro | | ✓ | `#0b1f24` |

Direção: **"Accessible & Ethical"** (saúde/confiança, alto contraste, WCAG). **Evitar:** neon, gradiente roxo/IA, motion pesado.

## Tipografia (mantida)

- **Plus Jakarta Sans** — UI e títulos (`--font-plus-jakarta`, via `next/font`).
- **Geist Mono** — números/código (`--font-geist-mono`).

## Uso do logo — do / don't

- **Do:** dar respiro (clear space ≈ altura de 1 "aba" ao redor); usar `text-primary` no app pra adaptar tema; favicon = versão branca no quadrado cyan; tamanho mínimo da marca ~16px (favicon simplifica o pulso).
- **Don't:** recolorir o check pra fora do verde; aplicar sombra/gradiente sobre a marca; esticar/distorcer; usar a marca cyan sobre fundo cyan (use a versão branca/mono).

## Onde aparece

Login/registro (`(auth)/layout.tsx`), sidebar (`app-sidebar.tsx`), aba do browser (favicon). O "C" antigo foi substituído.
