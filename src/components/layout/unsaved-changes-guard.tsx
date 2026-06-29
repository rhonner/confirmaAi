"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSidebarStore } from "@/stores/sidebar-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Avisa antes de sair de uma página com alterações não salvas.
 *
 * Cobre os caminhos de saída (relato da sócia 2026-06-29: dava pra navegar pra
 * fora de Configurações sem salvar e perder tudo, sem aviso):
 *  - **Navegação dura** (fechar aba, recarregar, link externo, logout — o
 *    `signOut` do NextAuth faz navegação de documento): `beforeunload` (prompt
 *    nativo do browser).
 *  - **Navegação interna por link** (sidebar, links da própria página):
 *    intercepta o clique em `<a>` na fase de captura, segura a navegação e abre
 *    um AlertDialog. Confirmar → `router.push(href)`. Ao interceptar, fecha o
 *    drawer mobile (senão o `stopPropagation` mataria o `onNavigate` do `<Link>`
 *    e o drawer ficaria aberto por cima do diálogo).
 *
 * Ignora o que não é navegação de página: links `/api/*`, `download`, `target`
 * externo, clique com modificador (ctrl/cmd/shift/alt) ou não-esquerdo, âncoras
 * (`#...`) e a própria rota atual.
 *
 * ⚠️ **Limitação conhecida**: navegação por **Voltar/Avançar do browser**
 * (popstate SPA) não dispara `beforeunload` nem clique de `<a>`, então não é
 * coberta — sair por Voltar com o form sujo descarta as edições sem aviso. Um
 * guard completo exigiria manipular o history (sentinela), que é frágil; fica
 * como follow-up se virar dor real.
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const router = useRouter();
  const setSidebarOpen = useSidebarStore((s) => s.setOpen);
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);

  React.useEffect(() => {
    if (!when) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("/api/")) return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (href === window.location.pathname) return;

      e.preventDefault();
      e.stopPropagation();
      // stopPropagation impede o onClick={onNavigate} do <Link> (que fecharia o
      // drawer mobile) de rodar — então fechamos o drawer aqui, senão ele fica
      // aberto por cima do diálogo.
      setSidebarOpen(false);
      setPendingHref(href);
    };
    // Captura: roda antes do onClick do <Link>, então a navegação é segurada.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [when]);

  const confirmLeave = () => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) router.push(href);
  };

  return (
    <AlertDialog open={!!pendingHref} onOpenChange={(open) => !open && setPendingHref(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
          <AlertDialogDescription>
            Você tem alterações não salvas. Se sair agora, elas serão perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={confirmLeave}>Sair sem salvar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
