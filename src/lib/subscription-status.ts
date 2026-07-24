// Rótulos + cor amigáveis para o SubscriptionStatus (UI pt-BR). Fonte única.
export type SubscriptionStatusMeta = { label: string; className: string };

export function getSubscriptionStatusMeta(status: string): SubscriptionStatusMeta {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return { label: "Ativo", className: "text-emerald-600 dark:text-emerald-400" };
    case "PAST_DUE":
      return { label: "Pagamento em atraso", className: "text-amber-600 dark:text-amber-400" };
    case "CANCELED":
      return { label: "Cancelado", className: "text-muted-foreground" };
    case "SUSPENDED":
      return { label: "Suspenso", className: "text-rose-600 dark:text-rose-400" };
    default:
      return { label: status, className: "" };
  }
}
