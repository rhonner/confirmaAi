"use client";

import * as React from "react";
import { useState } from "react";
import {
  usePatientsPaginated,
  useDeletePatient,
} from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, Users, X, ChevronLeft, ChevronRight } from "lucide-react";
import { ExportCsvButton } from "@/components/billing/export-csv-button";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/layout/page-header";
import { formatPhoneDisplay } from "@/lib/phone";
import { PatientFormDialog, type ExistingPatient } from "@/components/forms/patient-form-dialog";
import { QuotaBanner } from "@/components/billing/quota-banner";

export default function PacientesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<ExistingPatient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    appointmentsCount: number;
  } | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const { data: paginated, isLoading } = usePatientsPaginated({
    search: debouncedSearch,
    page,
    limit: PAGE_SIZE,
  });
  const patients = paginated?.data;
  const meta = paginated?.meta;
  const deleteMutation = useDeletePatient();

  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const handleOpenDialog = (patient?: ExistingPatient | null) => {
    setSelectedPatient(patient ?? null);
    setDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget) {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pacientes"
        description="Gerencie seus pacientes/clientes"
        action={
          <div className="flex gap-2">
            <ExportCsvButton url="/api/patients/export" />
            <Button onClick={() => handleOpenDialog()} data-testid="patients-create-trigger">
              <Plus className="mr-2 h-4 w-4" />
              Novo Paciente
            </Button>
          </div>
        }
      />

      <QuotaBanner />

      <PatientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        patient={selectedPatient}
      />

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, telefone ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 pr-10"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Limpar busca"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="text-center hidden sm:table-cell">Consultas</TableHead>
              <TableHead className="text-center hidden sm:table-cell">Faltas</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-40" /></TableCell>
                  <TableCell className="hidden sm:table-cell text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                  <TableCell className="hidden sm:table-cell text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : patients && patients.length > 0 ? (
              patients.map((patient) => (
                <TableRow key={patient.id} className="transition-colors duration-150 hover:bg-accent/50 cursor-default">
                  <TableCell className="font-medium">{patient.name}</TableCell>
                  <TableCell className="font-mono text-sm">{formatPhoneDisplay(patient.phone)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {patient.email || "-"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center text-sm tabular-nums">
                    {patient._count?.appointments ?? 0}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center text-sm tabular-nums">
                    {(patient.noShowCount ?? 0) > 0 ? (
                      <span className="text-rose-600 dark:text-rose-400 font-medium">
                        {patient.noShowCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(patient as ExistingPatient)}
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDeleteTarget({
                            id: patient.id,
                            name: patient.name,
                            appointmentsCount: patient._count?.appointments ?? 0,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                        <span className="sr-only">Excluir</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <Users className="h-12 w-12 text-muted-foreground/50" />
                    <div>
                      <p className="font-medium">
                        {search ? "Nenhum paciente encontrado" : "Nenhum paciente cadastrado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {search
                          ? "Tente buscar com outros termos"
                          : "Cadastre seu primeiro paciente para começar"}
                      </p>
                    </div>
                    {!search && (
                      <Button size="sm" onClick={() => handleOpenDialog()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Cadastrar Paciente
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <p className="text-muted-foreground">
            Página {meta.page} de {meta.totalPages} · {meta.total} paciente
            {meta.total !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={meta.page >= meta.totalPages}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>?
              {deleteTarget && deleteTarget.appointmentsCount > 0 && (
                <>
                  {" "}Os <strong>{deleteTarget.appointmentsCount}</strong>{" "}
                  agendamento{deleteTarget.appointmentsCount !== 1 ? "s" : ""} passado
                  {deleteTarget.appointmentsCount !== 1 ? "s" : ""} também serão removidos.
                  Se houver agendamentos futuros ativos, a exclusão será bloqueada.
                </>
              )}{" "}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
