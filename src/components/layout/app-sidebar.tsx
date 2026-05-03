"use client";

import Link from "next/link";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Agenda", href: "/agenda", icon: Calendar },
  { name: "Pacientes", href: "/pacientes", icon: Users },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

type AppSidebarProps = {
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
};

export function AppSidebar({ pathname, onNavigate, collapsed = false }: AppSidebarProps) {
  return (
    <div className="flex h-full flex-col glass-sidebar">
      {/* Logo */}
      <div
        className={cn(
          "border-b border-sidebar-border flex items-center gap-3",
          collapsed ? "p-4 justify-center" : "p-6",
        )}
      >
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <span className="text-primary-foreground font-bold text-sm">C</span>
        </div>
        {!collapsed && (
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-teal-400">
            Clínica Organizada
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1", collapsed ? "p-2" : "p-4")}>
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          const linkContent = (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              aria-label={collapsed ? item.name : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 border border-transparent",
                collapsed ? "px-3 py-3 justify-center" : "px-4 py-3",
                isActive
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {isActive && (
                <div className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary animate-scale-in" />
              )}
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform duration-200 group-hover:scale-110 shrink-0",
                  isActive && "text-primary",
                )}
              />
              {!collapsed && <span className="flex-1">{item.name}</span>}
              {!collapsed && isActive && (
                <ChevronRight className="h-4 w-4 animate-fade-in text-primary/60" />
              )}
            </Link>
          );

          return collapsed ? (
            <Tooltip key={item.name}>
              <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {item.name}
              </TooltipContent>
            </Tooltip>
          ) : (
            linkContent
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground text-center">
            Clínica Organizada · v0.1
          </p>
        </div>
      )}
    </div>
  );
}
