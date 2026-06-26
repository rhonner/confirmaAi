import * as React from "react";

/**
 * Marca "Agenda Viva" da Clínica Organizada — calendário (agenda organizada)
 * com o cabeçalho em **batimento cardíaco** (saúde / "viva") e um **check** de
 * confirmação. Conta a história do produto: confirmar agendamentos reduz faltas.
 *
 * O calendário/abas/pulso usam `currentColor` (controle via `text-primary` →
 * adapta automaticamente a light/dark pelo tema); o check é verde fixo
 * (`#10b981`, legível nos dois fundos). Para o favicon de browser ver
 * `src/app/icon.svg`; para uso externo (e-mails/docs) `public/brand/`.
 *
 * Uso: `<LogoMark className="h-8 w-8 text-primary" />`
 */
export function LogoMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label="Clínica Organizada"
      {...props}
    >
      {/* abas do calendário */}
      <rect x="20" y="9" width="4.6" height="11" rx="2.3" fill="currentColor" />
      <rect x="39.4" y="9" width="4.6" height="11" rx="2.3" fill="currentColor" />
      {/* corpo */}
      <rect x="10" y="15" width="44" height="39" rx="9" stroke="currentColor" strokeWidth="4.5" />
      {/* cabeçalho = batimento (pulso de saúde) */}
      <path
        d="M11 26h9l2.5-5 3.5 10 2.5-5h22"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* check de confirmação */}
      <path
        d="M23 40.5l6 6 12-13.5"
        stroke="#10b981"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
