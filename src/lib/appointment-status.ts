// Rótulos e cores de status de agendamento — fonte ÚNICA. Substitui as cópias
// (que divergiam) de agenda/page.tsx e dashboard/page.tsx; usado também pela
// página pública de confirmação por link. Superset das duas (inclui
// NOT_CONFIRMED e COMPLETED).

export function getStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "CONFIRMED":
      return "Confirmado";
    case "PENDING":
      return "Pendente";
    case "NOT_CONFIRMED":
      return "Não confirmado";
    case "NO_SHOW":
      return "Faltou";
    case "CANCELED":
      return "Cancelado";
    case "COMPLETED":
      return "Concluído";
    default:
      return status;
  }
}

export function getStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case "CONFIRMED":
      return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "PENDING":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    case "NOT_CONFIRMED":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "NO_SHOW":
      return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "CANCELED":
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
  }
}
