import { PrismaClient } from "../src/generated/prisma/client"
import { AppointmentStatus, MessageType, MessageStatus } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import * as bcrypt from "bcryptjs"
import { addDays, addHours, setHours, setMinutes } from "date-fns"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("Starting seed...")

  // Clean database
  await prisma.messageLog.deleteMany({})
  await prisma.appointment.deleteMany({})
  await prisma.settings.deleteMany({})
  await prisma.patient.deleteMany({})
  await prisma.user.deleteMany({})

  // Create user
  const hashedPassword = await bcrypt.hash("123456", 10)

  const user = await prisma.user.create({
    data: {
      name: "Rhonner Matheus",
      email: "rhonner.matheus@gmail.com",
      password: hashedPassword,
      clinicName: "Clínica Saúde Total",
      avgAppointmentValue: 150.0,
      // Grandfathering Sprint 4: seed user já vem com email verificado
      emailVerifiedAt: new Date(),
    },
  })

  console.log(`Created user: ${user.email}`)

  // Create settings for user
  await prisma.settings.create({
    data: {
      userId: user.id,
      confirmationHoursBefore: 24,
      reminderHoursBefore: 6,
    },
  })

  console.log("Created settings")

  // Create subscription (Sprint 1+ — todo user precisa ter Subscription).
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: "PRO",
      status: "ACTIVE",
    },
  })

  console.log("Created subscription PRO/ACTIVE")

  // Create patients
  const patientsData = [
    { name: "Maria Santos", phone: "+5511999990001", email: "maria.santos@email.com" },
    { name: "José Oliveira", phone: "+5511999990002", email: "jose.oliveira@email.com" },
    { name: "Ana Costa", phone: "+5511999990003", email: null },
    { name: "Pedro Souza", phone: "+5511999990004", email: "pedro.souza@email.com" },
    { name: "Carla Lima", phone: "+5511999990005", email: null },
  ]

  const { hashPhone } = await import("../src/lib/billing/identifiers")
  const patients = []
  for (const patientData of patientsData) {
    const phoneCanonical = patientData.phone.replace(/\D/g, "")
    const patient = await prisma.patient.create({
      data: {
        ...patientData,
        phoneCanonical,
        userId: user.id,
      },
    })
    // Cria slot PHONE para a quota (admin é PRO então quota não trava, mas
    // mantém ledger consistente para quando alterar plano).
    await prisma.patientQuotaSlot.create({
      data: {
        userId: user.id,
        identifierType: "PHONE",
        identifierHash: hashPhone(phoneCanonical),
        patientId: patient.id,
      },
    })
    patients.push(patient)
    console.log(`Created patient: ${patient.name}`)
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { patientSlotCount: patients.length },
  })

  // Create appointments spread over next 7 days
  const now = new Date()
  const appointmentsData = [
    // Today - Pending
    {
      patientId: patients[0].id,
      dateTime: setMinutes(setHours(now, 14), 0),
      status: AppointmentStatus.PENDING,
      notes: "Consulta de rotina",
    },
    // Tomorrow - Confirmed
    {
      patientId: patients[1].id,
      dateTime: setMinutes(setHours(addDays(now, 1), 10), 0),
      status: AppointmentStatus.CONFIRMED,
      confirmationSentAt: addHours(now, -26),
      confirmedAt: addHours(now, -25),
    },
    // Tomorrow - Pending with confirmation sent
    {
      patientId: patients[2].id,
      dateTime: setMinutes(setHours(addDays(now, 1), 15), 0),
      status: AppointmentStatus.PENDING,
      confirmationSentAt: addHours(now, -2),
    },
    // In 2 days - Canceled
    {
      patientId: patients[3].id,
      dateTime: setMinutes(setHours(addDays(now, 2), 9), 0),
      status: AppointmentStatus.CANCELED,
      notes: "Paciente cancelou",
    },
    // In 3 days - Pending
    {
      patientId: patients[4].id,
      dateTime: setMinutes(setHours(addDays(now, 3), 11), 0),
      status: AppointmentStatus.PENDING,
    },
    // In 3 days - Confirmed
    {
      patientId: patients[0].id,
      dateTime: setMinutes(setHours(addDays(now, 3), 16), 0),
      status: AppointmentStatus.CONFIRMED,
      confirmationSentAt: addHours(now, -2),
      confirmedAt: addHours(now, -1),
    },
    // In 4 days - NO_SHOW (past appointment)
    {
      patientId: patients[1].id,
      dateTime: setMinutes(setHours(addDays(now, -1), 14), 0),
      status: AppointmentStatus.NO_SHOW,
      confirmationSentAt: addDays(now, -2),
    },
    // In 5 days - Pending
    {
      patientId: patients[2].id,
      dateTime: setMinutes(setHours(addDays(now, 5), 10), 0),
      status: AppointmentStatus.PENDING,
    },
    // In 6 days - Confirmed
    {
      patientId: patients[3].id,
      dateTime: setMinutes(setHours(addDays(now, 6), 13), 0),
      status: AppointmentStatus.CONFIRMED,
      confirmationSentAt: addDays(now, -1),
      confirmedAt: addHours(now, -12),
    },
    // In 7 days - Not confirmed
    {
      patientId: patients[4].id,
      dateTime: setMinutes(setHours(addDays(now, 7), 15), 0),
      status: AppointmentStatus.NOT_CONFIRMED,
      confirmationSentAt: addHours(now, -3),
      reminderSentAt: addHours(now, -1),
    },
  ]

  const appointments = []
  for (const appointmentData of appointmentsData) {
    const appointment = await prisma.appointment.create({
      data: {
        ...appointmentData,
        userId: user.id,
      },
    })
    appointments.push(appointment)
    console.log(`Created appointment for ${appointment.dateTime.toISOString()}`)
  }

  // Create message logs for appointments with confirmationSentAt
  const appointmentsWithConfirmation = appointments.filter(
    (apt) => apt.confirmationSentAt !== null
  )

  for (const appointment of appointmentsWithConfirmation) {
    // Create confirmation message log
    await prisma.messageLog.create({
      data: {
        appointmentId: appointment.id,
        type: MessageType.CONFIRMATION,
        sentAt: appointment.confirmationSentAt!,
        status: MessageStatus.DELIVERED,
        response: appointment.status === AppointmentStatus.CONFIRMED ? "1" : null,
        respondedAt: appointment.confirmedAt,
      },
    })
    console.log(`Created message log for appointment ${appointment.id}`)

    // Create reminder message log for appointments with reminderSentAt
    if (appointment.reminderSentAt) {
      await prisma.messageLog.create({
        data: {
          appointmentId: appointment.id,
          type: MessageType.REMINDER,
          sentAt: appointment.reminderSentAt,
          status: MessageStatus.DELIVERED,
        },
      })
      console.log(`Created reminder log for appointment ${appointment.id}`)
    }
  }

  console.log("Seed completed successfully!")
}

main()
  .catch((e) => {
    console.error("Error during seed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
