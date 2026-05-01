import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "./whatsapp";
import {
  formatMessage,
  formatAppointmentDate,
  formatAppointmentTime,
} from "./message-template";

async function sendConfirmations(): Promise<void> {
  try {
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        confirmationSentAt: null,
        status: "PENDING",
        user: { whatsappStatus: "CONNECTED" },
      },
      include: {
        patient: true,
        user: {
          include: {
            settings: true,
          },
        },
      },
    });

    for (const appointment of appointments) {
      const settings = appointment.user.settings;
      if (!settings) continue;

      const hoursBefore = settings.confirmationHoursBefore;
      const sendTime = new Date(appointment.dateTime);
      sendTime.setHours(sendTime.getHours() - hoursBefore);

      if (now < sendTime || now > appointment.dateTime) continue;

      const message = formatMessage(settings.confirmationMessage, {
        nome: appointment.patient.name,
        data: formatAppointmentDate(appointment.dateTime),
        hora: formatAppointmentTime(appointment.dateTime),
        clinica: appointment.user.clinicName,
      });

      const success = await sendWhatsAppMessage(
        appointment.user.evolutionInstanceName,
        appointment.patient.phone,
        message
      );

      if (success) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { confirmationSentAt: new Date() },
        });

        await prisma.messageLog.create({
          data: {
            appointmentId: appointment.id,
            type: "CONFIRMATION",
            status: "SENT",
          },
        });
      }
    }
  } catch (error) {
    console.error("Error in sendConfirmations:", error);
  }
}

async function sendReminders(): Promise<void> {
  try {
    const now = new Date();

    const appointments = await prisma.appointment.findMany({
      where: {
        confirmationSentAt: { not: null },
        reminderSentAt: null,
        status: "PENDING",
        user: { whatsappStatus: "CONNECTED" },
      },
      include: {
        patient: true,
        user: {
          include: {
            settings: true,
          },
        },
      },
    });

    for (const appointment of appointments) {
      const settings = appointment.user.settings;
      if (!settings) continue;

      const hoursBefore = settings.reminderHoursBefore;
      const sendTime = new Date(appointment.dateTime);
      sendTime.setHours(sendTime.getHours() - hoursBefore);

      if (now < sendTime || now > appointment.dateTime) continue;

      const message = formatMessage(settings.reminderMessage, {
        nome: appointment.patient.name,
        data: formatAppointmentDate(appointment.dateTime),
        hora: formatAppointmentTime(appointment.dateTime),
        clinica: appointment.user.clinicName,
      });

      const success = await sendWhatsAppMessage(
        appointment.user.evolutionInstanceName,
        appointment.patient.phone,
        message
      );

      if (success) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminderSentAt: new Date() },
        });

        await prisma.messageLog.create({
          data: {
            appointmentId: appointment.id,
            type: "REMINDER",
            status: "SENT",
          },
        });
      }
    }
  } catch (error) {
    console.error("Error in sendReminders:", error);
  }
}

async function markNoShows(): Promise<void> {
  try {
    const now = new Date();

    await prisma.appointment.updateMany({
      where: {
        dateTime: { lt: now },
        status: "PENDING",
      },
      data: {
        status: "NO_SHOW",
      },
    });
  } catch (error) {
    console.error("Error in markNoShows:", error);
  }
}

export async function runSchedulerJobs(): Promise<void> {
  await sendConfirmations();
  await sendReminders();
  await markNoShows();
}
