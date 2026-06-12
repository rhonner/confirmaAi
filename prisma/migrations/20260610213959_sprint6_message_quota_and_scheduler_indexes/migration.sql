-- AlterEnum
ALTER TYPE "MessageStatus" ADD VALUE 'QUOTA_BLOCKED';

-- CreateIndex
CREATE INDEX "Appointment_status_confirmationSentAt_idx" ON "Appointment"("status", "confirmationSentAt");

-- CreateIndex
CREATE INDEX "Appointment_status_dateTime_idx" ON "Appointment"("status", "dateTime");
