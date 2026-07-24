"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Menu, LogOut, PanelLeftClose, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
import { UsageBadge } from "@/components/billing/usage-badge";

type AppHeaderProps = {
  clinicName: string;
  onMenuClick: () => void;
  onToggleCollapsed?: () => void;
  collapsed?: boolean;
};

export function AppHeader({
  clinicName,
  onMenuClick,
  onToggleCollapsed,
  collapsed,
}: AppHeaderProps) {
  const [confirmLogout, setConfirmLogout] = useState(false);

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/70 backdrop-blur-xl px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
        aria-label="Abrir menu de navegação"
      >
        <Menu className="h-5 w-5" />
      </Button>
      {onToggleCollapsed && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="hidden lg:inline-flex"
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold tracking-tight">{clinicName}</h2>
      </div>

      <div className="flex items-center gap-2">
        <UsageBadge />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmLogout(true)}
          className="gap-2 hover:bg-destructive/10 hover:text-destructive transition-colors duration-200"
          aria-label="Sair da conta"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </div>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Você precisará entrar novamente para acessar o sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => signOut({ callbackUrl: "/login" })}>
              Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
