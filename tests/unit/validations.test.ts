import { describe, it, expect } from "vitest";
import {
  createPatientSchema,
  updatePatientSchema,
} from "@/lib/validations/patient";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
} from "@/lib/validations/appointment";
import { updateSettingsSchema } from "@/lib/validations/settings";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

describe("Patient validations", () => {
  describe("createPatientSchema", () => {
    it("accepts valid patient data", () => {
      const validData = {
        name: "João Silva",
        phone: "+5511987654321",
        email: "joao@example.com",
        notes: "Paciente novo",
      };

      const result = createPatientSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it("fails when name is missing", () => {
      const invalidData = {
        phone: "+5511987654321",
        email: "joao@example.com",
      };

      const result = createPatientSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when name is too short", () => {
      const invalidData = {
        name: "AB",
        phone: "+5511987654321",
      };

      const result = createPatientSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when phone is missing", () => {
      const invalidData = {
        name: "João Silva",
        email: "joao@example.com",
      };

      const result = createPatientSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when phone format is invalid", () => {
      const invalidData = {
        name: "João Silva",
        phone: "11987654321", // missing +55
      };

      const result = createPatientSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when email is invalid", () => {
      const invalidData = {
        name: "João Silva",
        phone: "+5511987654321",
        email: "not-an-email",
      };

      const result = createPatientSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("accepts valid data without optional email", () => {
      const validData = {
        name: "João Silva",
        phone: "+5511987654321",
      };

      const result = createPatientSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it("accepts null email", () => {
      const validData = {
        name: "João Silva",
        phone: "+5511987654321",
        email: null,
      };

      const result = createPatientSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });
});

describe("Appointment validations", () => {
  describe("createAppointmentSchema", () => {
    it("accepts valid appointment data", () => {
      const validData = {
        patientId: "123e4567-e89b-12d3-a456-426614174000",
        dateTime: "2026-02-17T14:30:00.000Z",
        notes: "Primeira consulta",
      };

      const result = createAppointmentSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it("fails when patientId is missing", () => {
      const invalidData = {
        dateTime: "2026-02-17T14:30:00.000Z",
      };

      const result = createAppointmentSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when dateTime is missing", () => {
      const invalidData = {
        patientId: "123e4567-e89b-12d3-a456-426614174000",
      };

      const result = createAppointmentSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when dateTime is not ISO format", () => {
      const invalidData = {
        patientId: "123e4567-e89b-12d3-a456-426614174000",
        dateTime: "17/02/2026 14:30",
      };

      const result = createAppointmentSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("accepts valid data without optional notes", () => {
      const validData = {
        patientId: "123e4567-e89b-12d3-a456-426614174000",
        dateTime: "2026-02-17T14:30:00.000Z",
      };

      const result = createAppointmentSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });
});

describe("Settings validations", () => {
  describe("updateSettingsSchema", () => {
    it("accepts valid settings with all fields", () => {
      const validData = {
        confirmationHoursBefore: 24,
        reminderHoursBefore: 2,
        confirmationMessage:
          "Olá {nome}, confirme sua consulta em {data} às {hora}",
        reminderMessage: "Lembrete: sua consulta é hoje às {hora}",
      };

      const result = updateSettingsSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it("accepts partial updates", () => {
      const validData = {
        confirmationHoursBefore: 48,
      };

      const result = updateSettingsSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it("fails when confirmationHoursBefore is negative", () => {
      const invalidData = {
        confirmationHoursBefore: -1,
      };

      const result = updateSettingsSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when confirmationHoursBefore is zero", () => {
      const invalidData = {
        confirmationHoursBefore: 0,
      };

      const result = updateSettingsSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when confirmationHoursBefore exceeds max", () => {
      const invalidData = {
        confirmationHoursBefore: 169,
      };

      const result = updateSettingsSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when confirmationMessage is too short", () => {
      const invalidData = {
        confirmationMessage: "Oi",
      };

      const result = updateSettingsSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when reminderHoursBefore exceeds max", () => {
      const invalidData = {
        reminderHoursBefore: 169,
      };

      const result = updateSettingsSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });
});

describe("Auth validations", () => {
  describe("loginSchema", () => {
    it("accepts valid login data", () => {
      const validData = {
        email: "user@example.com",
        password: "senha123",
      };

      const result = loginSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it("fails when email is invalid", () => {
      const invalidData = {
        email: "not-an-email",
        password: "senha123",
      };

      const result = loginSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when password is too short", () => {
      const invalidData = {
        email: "user@example.com",
        password: "12345",
      };

      const result = loginSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when email is missing", () => {
      const invalidData = {
        password: "senha123",
      };

      const result = loginSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when password is missing", () => {
      const invalidData = {
        email: "user@example.com",
      };

      const result = loginSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe("registerSchema", () => {
    it("accepts valid registration data", () => {
      const validData = {
        name: "João Silva",
        email: "joao@example.com",
        password: "senha123",
        clinicName: "Clínica Vida",
        avgAppointmentValue: 150,
      };

      const result = registerSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it("fails when name is too short", () => {
      const invalidData = {
        name: "AB",
        email: "joao@example.com",
        password: "senha123",
        clinicName: "Clínica Vida",
      };

      const result = registerSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when clinicName is too short", () => {
      const invalidData = {
        name: "João Silva",
        email: "joao@example.com",
        password: "senha123",
        clinicName: "AB",
      };

      const result = registerSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("fails when avgAppointmentValue is negative", () => {
      const invalidData = {
        name: "João Silva",
        email: "joao@example.com",
        password: "senha123",
        clinicName: "Clínica Vida",
        avgAppointmentValue: -10,
      };

      const result = registerSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("defaults avgAppointmentValue to 0 when not provided", () => {
      const validData = {
        name: "João Silva",
        email: "joao@example.com",
        password: "senha123",
        clinicName: "Clínica Vida",
      };

      const result = registerSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.avgAppointmentValue).toBe(0);
      }
    });
  });
});
