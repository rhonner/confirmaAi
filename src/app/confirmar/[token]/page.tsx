import type { Metadata } from "next";
import { CheckCircle2, XCircle, AlertCircle, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifyConfirmationToken } from "@/lib/services/confirmation-token";
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from "@/lib/services/message-template";
import { getStatusLabel } from "@/lib/appointment-status";
import { ConfirmActions } from "@/components/confirmation/confirm-actions";

export const metadata: Metadata = {
  title: "Confirmar agendamento — Clínica Organizada",
  robots: { index: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl sm:p-8">
        {children}
      </div>
    </div>
  );
}

function Message({
  icon: Icon,
  color,
  title,
  body,
}: {
  icon: typeof CheckCircle2;
  color: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Icon className={`h-12 w-12 ${color}`} />
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function ConfirmarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyConfirmationToken(token);

  if (!verified.ok) {
    return (
      <Shell>
        <Message
          icon={AlertCircle}
          color={verified.reason === "EXPIRED" ? "text-amber-500" : "text-red-500"}
          title={verified.reason === "EXPIRED" ? "Prazo encerrado" : "Link inválido"}
          body={
            verified.reason === "EXPIRED"
              ? "O prazo para confirmar por este link já passou. Se precisar, fale com a clínica."
              : "Este link não é válido. Use o link enviado no WhatsApp pela clínica."
          }
        />
      </Shell>
    );
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: verified.appointmentId },
    select: {
      status: true,
      dateTime: true,
      patient: { select: { name: true } },
      user: { select: { clinicName: true } },
    },
  });

  if (!appointment) {
    return (
      <Shell>
        <Message
          icon={AlertCircle}
          color="text-red-500"
          title="Agendamento não encontrado"
          body="Este link não corresponde a um agendamento ativo."
        />
      </Shell>
    );
  }

  const dateLabel = formatAppointmentDate(appointment.dateTime);
  const timeLabel = formatAppointmentTime(appointment.dateTime);
  const details = (
    <div className="mb-6 rounded-xl border bg-muted/30 p-4 text-center">
      <p className="text-sm text-muted-foreground">{appointment.user.clinicName}</p>
      <p className="mt-1 font-medium first-letter:uppercase">
        {dateLabel} às {timeLabel}
      </p>
      <p className="text-sm text-muted-foreground">{appointment.patient.name}</p>
    </div>
  );

  // Estado terminal (já confirmado/cancelado/faltou) — o link "trava".
  if (appointment.status !== "PENDING") {
    const confirmed = appointment.status === "CONFIRMED";
    return (
      <Shell>
        {details}
        <Message
          icon={confirmed ? CheckCircle2 : XCircle}
          color={confirmed ? "text-emerald-500" : "text-muted-foreground"}
          title={
            confirmed
              ? "Agendamento já confirmado"
              : `Agendamento ${getStatusLabel(appointment.status).toLowerCase()}`
          }
          body={
            confirmed
              ? "Sua presença já estava confirmada. Nos vemos no horário. 🙂"
              : "Este agendamento não está mais aberto para confirmação."
          }
        />
      </Shell>
    );
  }

  // Já passou do horário → tarde demais.
  if (appointment.dateTime.getTime() <= Date.now()) {
    return (
      <Shell>
        {details}
        <Message
          icon={AlertCircle}
          color="text-amber-500"
          title="Horário já passou"
          body="Não é mais possível confirmar este agendamento. Fale com a clínica se precisar remarcar."
        />
      </Shell>
    );
  }

  // PENDING + válido → mostra os dados + botões (a ação é um POST, nunca no GET).
  return (
    <Shell>
      <div className="mb-5 flex flex-col items-center gap-2 text-center">
        <CalendarClock className="h-10 w-10 text-primary" />
        <h1 className="text-xl font-semibold">Confirmar seu agendamento</h1>
      </div>
      {details}
      <ConfirmActions token={token} />
    </Shell>
  );
}
