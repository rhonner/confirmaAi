import { describe, it, expect, beforeAll } from "vitest";
import {
  canonicalizePhone,
  hashCpf,
  hashPhone,
  primaryIdentifier,
  allIdentifiers,
} from "@/lib/billing/identifiers";

beforeAll(() => {
  // Pepper estável para os testes serem determinísticos.
  process.env.CPF_HASH_PEPPER = "test-pepper-do-not-use-in-prod";
});

describe("canonicalizePhone", () => {
  it("strips non-digits", () => {
    expect(canonicalizePhone("+55 (11) 98765-4321")).toBe("5511987654321");
    expect(canonicalizePhone("11 98765-4321")).toBe("11987654321");
  });
});

describe("hashCpf / hashPhone", () => {
  it("são determinísticos", () => {
    expect(hashCpf("11144477735")).toBe(hashCpf("111.444.777-35"));
    expect(hashPhone("+5511987654321")).toBe(hashPhone("5511987654321"));
  });

  it("CPFs diferentes produzem hashes diferentes", () => {
    expect(hashCpf("11144477735")).not.toBe(hashCpf("52998224725"));
  });

  it("phone hash difere de CPF hash mesmo com input numérico igual", () => {
    // CPF e phone são namespaces lógicos diferentes — o hash usa o pepper
    // global mas o input bruto é diferente após canonicalização.
    expect(hashCpf("11144477735")).not.toBe(hashPhone("11144477735"));
  });
});

describe("primaryIdentifier", () => {
  it("escolhe CPF se presente", () => {
    const r = primaryIdentifier({ cpf: "11144477735", phone: "+5511987654321" });
    expect(r.type).toBe("CPF");
    expect(r.hash).toBe(hashCpf("11144477735"));
  });

  it("usa phone se CPF ausente", () => {
    const r = primaryIdentifier({ phone: "+5511987654321" });
    expect(r.type).toBe("PHONE");
    expect(r.hash).toBe(hashPhone("+5511987654321"));
  });

  it("trata cpf null/undefined como ausente", () => {
    expect(primaryIdentifier({ cpf: null, phone: "+551199" }).type).toBe("PHONE");
    expect(primaryIdentifier({ cpf: undefined, phone: "+551199" }).type).toBe("PHONE");
  });
});

describe("allIdentifiers", () => {
  it("retorna ambos quando ambos presentes", () => {
    const r = allIdentifiers({ cpf: "11144477735", phone: "+5511987654321" });
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.type).sort()).toEqual(["CPF", "PHONE"]);
  });
  it("retorna só phone quando CPF ausente", () => {
    const r = allIdentifiers({ phone: "+551199" });
    expect(r.map((x) => x.type)).toEqual(["PHONE"]);
  });
  it("retorna vazio quando phone vazio e sem CPF", () => {
    expect(allIdentifiers({ phone: "" })).toEqual([]);
  });
});
