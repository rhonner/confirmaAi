"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BUSINESS_TYPE_LABELS, getTerminology } from "@/lib/terminology";
import type { BusinessType } from "@/generated/prisma/client";
import { Stethoscope, Sparkles, Scissors, Calculator, Store, Loader2 } from "lucide-react";

// Record<BusinessType, icon> → exaustividade garantida pelo compilador: um novo
// ramo no enum vira ERRO de tipo aqui (não some silenciosamente do wizard).
const OPTION_ICONS: Record<BusinessType, typeof Stethoscope> = {
  HEALTH: Stethoscope,
  AESTHETICS: Sparkles,
  BEAUTY: Scissors,
  FINANCE: Calculator,
  OTHER: Store,
};
const OPTIONS = Object.entries(OPTION_ICONS) as [BusinessType, typeof Stethoscope][];

/**
 * Wizard de onboarding (feature Terminologia por ramo). Aparece quando
 * `onboardingCompletedAt` da sessão é null (usuários novos; os antigos foram
 * backfillados na migration). Passo único: escolher o RAMO — isso define a
 * terminologia (Paciente vs Cliente) e conclui o onboarding.
 */
export function OnboardingWizard() {
  const { data: session, update: updateSession } = useSession();
  const [selected, setSelected] = useState<BusinessType | null>(null);
  const [saving, setSaving] = useState(false);
  // Permite fechar (escape hatch): sem isso, se o POST falhar de forma
  // persistente (API fora do ar), o modal não-dispensável travaria o dashboard
  // inteiro. Fechado, reaparece no próximo load (nudge, não trava). (code-review)
  const [dismissed, setDismissed] = useState(false);

  // Só mostra depois que a sessão carregou e o onboarding NÃO foi concluído.
  const open =
    session?.user != null &&
    session.user.onboardingCompletedAt == null &&
    !dismissed;

  async function finish() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessType: selected }),
      });
      if (!res.ok) {
        // Modal segue aberto (mas dispensável) — o usuário pode tentar de novo
        // ou fechar e usar o app.
        toast.error("Não foi possível salvar. Tente novamente.");
        return;
      }
      // POST PERSISTIU: fecha o wizard independentemente do refresh da sessão
      // (senão um blip no updateSession mostraria erro com o onboarding já salvo).
      setDismissed(true);
      const term = getTerminology(selected).patient.plural;
      toast.success(`Tudo pronto! Seus cadastros aparecem como "${term}".`);
      // Best-effort: reflete a terminologia já; se falhar, o próximo load reflete
      // via o lazy-load do jwt callback (não é erro — o dado já está salvo).
      try {
        await updateSession();
      } catch {
        // noop
      }
    } catch {
      toast.error("Falha de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setDismissed(true)}>
      {/* Dispensável (escape hatch p/ não travar o dashboard se o POST falhar);
          reaparece no próximo load enquanto o onboarding não for concluído. */}
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Bem-vindo! Qual é o segmento do seu negócio?</DialogTitle>
          <DialogDescription>
            Isso personaliza o sistema para você — inclusive como chamamos os seus
            cadastrados (paciente ou cliente).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPTIONS.map(([value, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSelected(value)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                selected === value
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "hover:bg-accent/50",
              )}
            >
              <Icon className="h-5 w-5 shrink-0 text-primary" />
              <span className="text-sm font-medium">{BUSINESS_TYPE_LABELS[value]}</span>
            </button>
          ))}
        </div>

        <Button className="w-full" onClick={finish} disabled={!selected || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Concluir
        </Button>
      </DialogContent>
    </Dialog>
  );
}
