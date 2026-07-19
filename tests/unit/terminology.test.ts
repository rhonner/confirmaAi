import { describe, it, expect } from "vitest";
import { getTerminology } from "../../src/lib/terminology";

describe("getTerminology (terminologia por ramo)", () => {
  it("HEALTH → Paciente/Pacientes", () => {
    expect(getTerminology("HEALTH").patient.singular).toBe("Paciente");
    expect(getTerminology("HEALTH").patient.plural).toBe("Pacientes");
  });

  it("null/undefined → default conservador 'Paciente' (contas antigas)", () => {
    expect(getTerminology(null).patient.singular).toBe("Paciente");
    expect(getTerminology(undefined).patient.singular).toBe("Paciente");
  });

  it("AESTHETICS/BEAUTY/FINANCE/OTHER → Cliente/Clientes", () => {
    for (const bt of ["AESTHETICS", "BEAUTY", "FINANCE", "OTHER"] as const) {
      expect(getTerminology(bt).patient.singular).toBe("Cliente");
      expect(getTerminology(bt).patient.plural).toBe("Clientes");
    }
  });
});
