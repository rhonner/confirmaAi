"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useDashboard, useAppointments } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Info,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { OnboardingBanner } from "@/components/dashboard/onboarding-banner";

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  className,
  delay = 0,
  tooltip,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  className?: string;
  delay?: number;
  tooltip?: string;
}) {
  return (
    <Card
      className="opacity-0 animate-fade-in-up transition-shadow duration-200 hover:shadow-lg cursor-default"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Sobre ${title}`}
                  className="text-muted-foreground/60 hover:text-muted-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[260px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${className}`}>{value}</div>
        {trend && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function getStatusColor(status: string) {
  switch (status.toUpperCase()) {
    case "CONFIRMED":
      return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "PENDING":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
    case "NO_SHOW":
      return "bg-red-500/10 text-red-700 dark:text-red-400";
    case "CANCELED":
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
  }
}

function getStatusLabel(status: string) {
  switch (status.toUpperCase()) {
    case "CONFIRMED":
      return "Confirmado";
    case "PENDING":
      return "Pendente";
    case "NO_SHOW":
      return "Faltou";
    case "CANCELED":
      return "Cancelado";
    default:
      return status;
  }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-28 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[350px] w-full" />
          </CardContent>
        </Card>
        <div className="col-span-3 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-1">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center justify-center h-full">
              <Skeleton className="h-16 w-16 rounded-full mb-4" />
              <Skeleton className="h-10 w-16 mb-1" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center justify-center h-full">
              <Skeleton className="h-16 w-16 rounded-full mb-4" />
              <Skeleton className="h-10 w-16 mb-1" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function computeWeeklyTrend(
  weeklyData: Array<{ total: number; noShow: number; confirmed: number }>
) {
  if (!weeklyData || weeklyData.length < 2) return null;
  const current = weeklyData[weeklyData.length - 1];
  const previous = weeklyData[weeklyData.length - 2];
  if (!previous || previous.total === 0) return null;

  const currentRate =
    current.total > 0 ? (current.confirmed / current.total) * 100 : 0;
  const previousRate = (previous.confirmed / previous.total) * 100;
  const diff = currentRate - previousRate;

  return { diff: Math.round(diff * 10) / 10, improving: diff >= 0 };
}

function UpcomingAppointments() {
  const { today, ahead, nowMs } = useMemo(() => {
    const now = new Date();
    return {
      today: format(now, "yyyy-MM-dd"),
      ahead: format(addDays(now, 7), "yyyy-MM-dd"),
      nowMs: now.getTime(),
    };
  }, []);
  const { data: appointments, isLoading } = useAppointments({
    startDate: today,
    endDate: ahead,
  });

  const upcoming = (appointments ?? [])
    .filter(
      (a) =>
        new Date(a.dateTime).getTime() >= nowMs && a.status !== "CANCELED",
    )
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    .slice(0, 6);

  return (
    <Card
      className="opacity-0 animate-fade-in-up transition-shadow duration-200 hover:shadow-lg"
      style={{ animationDelay: "300ms", animationFillMode: "forwards" }}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Próximos agendamentos</CardTitle>
        <Link
          href="/agenda"
          className="text-xs text-primary hover:underline font-medium"
        >
          Ver agenda →
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Calendar className="h-10 w-10 opacity-40 mb-2" />
            <p className="text-sm">Nenhum agendamento nos próximos 7 dias</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((apt) => {
              const dt = parseISO(apt.dateTime);
              const isToday =
                format(dt, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              return (
                <div
                  key={apt.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {apt.patient?.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isToday
                          ? `Hoje, ${format(dt, "HH:mm")}`
                          : format(dt, "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                  <Badge
                    className={
                      apt.status === "CONFIRMED"
                        ? "bg-green-500/10 text-green-700 dark:text-green-400"
                        : apt.status === "PENDING"
                        ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                        : "bg-gray-500/10 text-gray-700 dark:text-gray-400"
                    }
                  >
                    {apt.status === "CONFIRMED"
                      ? "Confirmado"
                      : apt.status === "PENDING"
                      ? "Pendente"
                      : apt.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<"7d" | "30d" | "month">("month");
  const { data, isLoading, error } = useDashboard(range);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-lg font-semibold">Erro ao carregar dashboard</p>
          <p className="text-sm text-muted-foreground">
            Tente recarregar a página
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <BarChart3 className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-semibold">Sem dados para exibir</p>
        <p className="text-sm text-muted-foreground">
          Crie agendamentos para visualizar suas métricas
        </p>
      </div>
    );
  }

  const weeklyTrend = computeWeeklyTrend(data.weeklyData);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Dashboard"
          description="Visão geral dos seus agendamentos"
        />
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
          {(
            [
              { v: "7d", label: "7 dias" },
              { v: "30d", label: "30 dias" },
              { v: "month", label: "Este mês" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setRange(opt.v)}
              className={
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors " +
                (range === opt.v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <OnboardingBanner />

      {/* Metrics Grid */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total de Agendamentos"
          value={data.totalAppointments}
          icon={Calendar}
          className="text-foreground"
          delay={0}
        />
        <MetricCard
          title="Taxa de Confirmação"
          value={`${(data.confirmationRate ?? 0).toFixed(1)}%`}
          icon={CheckCircle}
          trend={
            weeklyTrend
              ? `${weeklyTrend.diff >= 0 ? "+" : ""}${weeklyTrend.diff}% vs semana anterior`
              : undefined
          }
          className="text-emerald-600 dark:text-emerald-400"
          delay={75}
        />
        <MetricCard
          title="Taxa de Faltas"
          value={`${(data.noShowRate ?? 0).toFixed(1)}%`}
          icon={XCircle}
          className="text-rose-600 dark:text-rose-400"
          delay={150}
        />
        <MetricCard
          title="Prejuízo Estimado"
          value={`R$ ${(data.estimatedLoss ?? 0).toFixed(2)}`}
          icon={AlertTriangle}
          className="text-rose-600 dark:text-rose-400"
          delay={225}
          tooltip="Soma do valor médio da consulta multiplicado pelo nº de faltas no período. Ajuste o valor médio em Configurações."
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Weekly Stats Chart */}
        <Card className="col-span-4 opacity-0 animate-fade-in-up" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
          <CardHeader>
            <CardTitle>Estatísticas Semanais</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={data.weeklyData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="week"
                  stroke="currentColor"
                  className="text-muted-foreground"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="currentColor"
                  className="text-muted-foreground"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}`}
                />
                <RechartsTooltip
                  cursor={{ fill: "var(--color-muted)", opacity: 0.3 }}
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                    color: "var(--color-foreground)",
                  }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                  itemStyle={{ color: "var(--color-foreground)" }}
                />
                <Legend />
                <Bar
                  dataKey="confirmed"
                  name="Confirmados"
                  fill="var(--chart-1-hex)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
                <Bar
                  dataKey="noShow"
                  name="Faltas"
                  fill="#e11d48"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={50}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="col-span-3 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-1 content-start">
          <Card
            className="h-full flex flex-col justify-center bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20 opacity-0 animate-fade-in-up transition-shadow duration-200 hover:shadow-lg"
            style={{ animationDelay: "275ms", animationFillMode: "forwards" }}
          >
            <CardContent className="pt-6 flex flex-col items-center justify-center h-full">
              <div className="p-4 rounded-full bg-emerald-500/15 mb-4">
                <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                {data.confirmed}
              </div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Confirmados
              </p>
            </CardContent>
          </Card>
          <Card
            className="h-full flex flex-col justify-center bg-gradient-to-br from-rose-500/10 to-transparent border-rose-500/20 opacity-0 animate-fade-in-up transition-shadow duration-200 hover:shadow-lg"
            style={{ animationDelay: "350ms", animationFillMode: "forwards" }}
          >
            <CardContent className="pt-6 flex flex-col items-center justify-center h-full">
              <div className="p-4 rounded-full bg-rose-500/15 mb-4">
                <XCircle className="h-8 w-8 text-rose-600 dark:text-rose-400" />
              </div>
              <div className="text-4xl font-bold text-rose-600 dark:text-rose-400 mb-1">
                {data.noShow}
              </div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Faltas
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <UpcomingAppointments />
    </div>
  );
}
