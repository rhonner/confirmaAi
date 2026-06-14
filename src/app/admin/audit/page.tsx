"use client";

import Link from "next/link";
import { useAdminAudit } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ArrowLeft, ShieldAlert } from "lucide-react";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function fmt(iso: string) {
  return formatInTimeZone(new Date(iso), APP_TIMEZONE, "dd/MM/yy HH:mm", { locale: ptBR });
}

export default function AdminAuditPage() {
  const { data, isLoading, isError } = useAdminAudit();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Painel admin</h1>
          <p className="text-muted-foreground mt-1">
            Saúde operacional e auditoria cross-tenant.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </div>

      {isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Não foi possível carregar o painel.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Metric
                label="WhatsApp conectado"
                value={`${data.metrics.whatsappConnectedPct}%`}
                hint={`${data.metrics.whatsappConnected}/${data.metrics.whatsappWithInstance} instâncias`}
              />
              <Metric label="Usuários" value={String(data.metrics.totalUsers)} />
              <Metric
                label="Pagantes ativos"
                value={String(data.metrics.paidActive)}
                hint="PRO/PREMIUM ACTIVE"
              />
              <Metric
                label="Casos de fraude"
                value={String(data.fraudCases.length)}
                hint="CPF reusado / dedup"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Anti-fraude (CPF do dono)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.fraudCases.length === 0 ? (
                  <p className="px-6 pb-6 text-sm text-muted-foreground">
                    Nenhum caso registrado.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Data</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead className="w-[220px]">Tenant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.fraudCases.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {fmt(r.createdAt)}
                          </TableCell>
                          <TableCell className="font-medium">{r.label}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {r.tenantUserId ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Auditoria recente (todos os tenants)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Data</TableHead>
                      <TableHead>Ação</TableHead>
                      <TableHead className="w-[110px]">Origem</TableHead>
                      <TableHead className="w-[220px]">Tenant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recent.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {fmt(r.createdAt)}
                        </TableCell>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.actorType}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {r.tenantUserId ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
