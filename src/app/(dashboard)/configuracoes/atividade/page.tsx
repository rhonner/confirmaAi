"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccountActivity } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatInTimeZone, APP_TIMEZONE } from "@/lib/timezone";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, ChevronLeft, ChevronRight, History } from "lucide-react";

const ACTOR_LABEL: Record<string, string> = {
  USER: "Você",
  SYSTEM: "Sistema",
  WEBHOOK: "Webhook",
  ADMIN: "Admin",
  ANONYMOUS: "Anônimo",
};

export default function AtividadePage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAccountActivity(page);

  const items = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atividade da conta"
        description="Histórico das ações na sua conta — logins, alterações, mensagens e cobrança."
        action={
          <Button variant="outline" asChild>
            <Link href="/configuracoes">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="p-6 text-sm text-muted-foreground">
              Não foi possível carregar a atividade. Tente novamente.
            </p>
          ) : items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Nenhuma atividade registrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Data e hora</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead className="w-[120px]">Origem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatInTimeZone(
                        new Date(item.createdAt),
                        APP_TIMEZONE,
                        "dd/MM/yyyy 'às' HH:mm",
                        { locale: ptBR },
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.label}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ACTOR_LABEL[item.actorType] ?? item.actorType}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {meta.page} de {meta.totalPages} · {meta.total} registros
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        Registros são mantidos por 90 dias.
      </p>
    </div>
  );
}
