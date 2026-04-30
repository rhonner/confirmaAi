-- Aligns the database with current schema.prisma:
--   * Appointment.durationMinutes (was missing entirely)
--   * Patient (userId, phone) unique constraint
--   * User.avgAppointmentValue Decimal(10,2)

-- AlterTable: add durationMinutes with default 30 so existing rows are valid.
ALTER TABLE "Appointment"
  ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable: convert avgAppointmentValue from double precision to numeric(10,2).
ALTER TABLE "User"
  ALTER COLUMN "avgAppointmentValue" TYPE DECIMAL(10,2)
  USING ROUND("avgAppointmentValue"::numeric, 2);

-- CreateIndex: enforce unique phone per tenant (userId).
CREATE UNIQUE INDEX "Patient_userId_phone_key" ON "Patient"("userId", "phone");
