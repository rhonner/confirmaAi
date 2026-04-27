"use client";

import * as React from "react";
import { useState } from "react";
import {
  usePatientsPaginated,
  useCreatePatient,
  useUpdatePatient,
  useDeletePatient,
} from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Pencil, Trash2, Users, X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/layout/page-header";
import { PhoneInput } from "@/components/ui/phone-input";
import { formatPhoneDisplay, PHONE_REGEX } from "@/lib/phone";

const patientSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  phone: z.string().regex(PHONE_REGEX, "Informe um celular válido com DDD"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;

export default function PacientesPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<{
    id: string;
    name: string;
    phone: string;
    email?: string | null;
    notes?: string | null;
  } | null>(null);
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
  const createMutation = useCreatePatient();
  const updateMutation = useUpdatePatient();
  const deleteMutation = useDeletePatient();

  // Reset to page 1 whenever search changes.
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: { name: "", phone: "", email: "", notes: "" },
  });

  const handleOpenDialog = (patient?: typeof selectedPatient) => {
    if (patient) {
      setSelectedPatient(patient);
      reset({
        name: patient.name,
        phone: patient.phone,
        email: patient.email || "",
        notes: patient.notes || "",
      });
    } else {
      setSelectedPatient(null);
      reset({
        name: "",
        phone: "",
        email: "",
        notes: "",
      });
    }
    setDialogOpen(true);
  };

  const onSubmit = async (data: PatientForm) => {
    try {
      const cleanedData = {
        ...data,
        email: data.email || undefined,
        notes: data.notes || undefined,
      };

      if (selectedPatient) {
        await updateMutation.mutateAsync({
          ...cleanedData,
          id: selectedPatient.id,
        });
      } else {
        await createMutation.mutateAsync(cleanedData);
      }
      setDialogOpen(false);
      reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/telefone/i.test(message)) {
        setError("phone", { type: "server", message });
      } else if (/email/i.test(message)) {
        setError("email", { type: "server", message });
      }
    }
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
            <Button asChild variant="outline">
              <a href="/api/patients/export" download>
                <Download className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Exportar CSV</span>
                <span className="sm:hidden">CSV</span>
              </a>
            </Button>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Paciente
            </Button>
          </div>
        }
      />

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {selectedPatient ? "Editar" : "Novo"} Paciente
              </DialogTitle>
              <DialogDescription>
                {selectedPatient
                  ? "Atualize as informações do paciente"
                  : "Preencha os dados para cadastrar um novo paciente"}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  placeholder="João Silva"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <PhoneInput
                      id="phone"
                      placeholder="(11) 99999-9999"
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!errors.phone}
                    />
                  )}
                />
                {errors.phone ? (
                  <p className="text-sm text-destructive">
                    {errors.phone.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Será usado para enviar a confirmação automática.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (opcional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="paciente@email.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Informações adicionais sobre o paciente..."
                  rows={3}
                  {...register("notes")}
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Salvando..."
                    : selectedPatient
                    ? "Atualizar"
                    : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

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
                        onClick={() => handleOpenDialog(patient)}
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
                  {" "}Isso também excluirá <strong>{deleteTarget.appointmentsCount}</strong>{" "}
                  agendamento{deleteTarget.appointmentsCount !== 1 ? "s" : ""} relacionado
                  {deleteTarget.appointmentsCount !== 1 ? "s" : ""}.
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
