-- Adds QR code cache fields used to expose Evolution v2 async QR via webhook.
ALTER TABLE "User" ADD COLUMN "lastQrcodeBase64" TEXT;
ALTER TABLE "User" ADD COLUMN "lastQrcodeAt" TIMESTAMP(3);
