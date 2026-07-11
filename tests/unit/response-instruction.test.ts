import { describe, it, expect } from "vitest";
import {
  RESPONSE_INSTRUCTION,
  stripResponseInstruction,
  withResponseInstruction,
} from "@/lib/services/message-template";
import { CONFIRM_CODE, CANCEL_CODE } from "@/lib/services/webhook-parser";

describe("RESPONSE_INSTRUCTION", () => {
  it("derives the canonical codes from the parser (single source of truth)", () => {
    expect(CONFIRM_CODE).toBe("1");
    expect(CANCEL_CODE).toBe("2");
    expect(RESPONSE_INSTRUCTION).toBe(
      "Responda 1 para CONFIRMAR ou 2 para CANCELAR.",
    );
  });
});

describe("stripResponseInstruction", () => {
  it("removes the canonical instruction at the end of the body", () => {
    const input =
      "Olá {nome}, sua consulta na {clinica} está agendada para {data} às {hora}. Responda 1 para CONFIRMAR ou 2 para CANCELAR.";
    expect(stripResponseInstruction(input)).toBe(
      "Olá {nome}, sua consulta na {clinica} está agendada para {data} às {hora}.",
    );
  });

  it("removes a WRONG/inverted instruction (the reported bug: 2/5)", () => {
    // O usuário digitou números que o parser lê ao contrário/ignora.
    const input =
      "Olá {nome}. Responda 2 para CONFIRMAR ou 5 para CANCELAR.";
    expect(stripResponseInstruction(input)).toBe("Olá {nome}.");
  });

  it("removes a mid-sentence instruction without eating the rest of the phrase", () => {
    const input =
      "Olá {nome} Ainda não recebemos sua confirmação. Responda 2 para CONFIRMAR ou 5 para CANCELAR sua consulta na {clinica} dia {data} às {hora}";
    expect(stripResponseInstruction(input)).toBe(
      "Olá {nome} Ainda não recebemos sua confirmação. sua consulta na {clinica} dia {data} às {hora}",
    );
  });

  it("tolerates verb/connector variants (Digite ... e ...)", () => {
    const input = "Confirme por favor. Digite 1 para confirmar e 2 para cancelar.";
    expect(stripResponseInstruction(input)).toBe("Confirme por favor.");
  });

  it("leaves a body without any instruction untouched (only trims)", () => {
    const input = "Oi {nome}, tudo certo para {data}?";
    expect(stripResponseInstruction(input)).toBe(input);
  });

  it("does not touch the word 'confirmar' when it is not a response instruction", () => {
    const input = "Precisamos confirmar seu endereço antes da consulta.";
    expect(stripResponseInstruction(input)).toBe(input);
  });

  it("preserves the user's deliberate internal formatting (double spaces, blank lines)", () => {
    // Sem instrução para remover, o strip NÃO deve reescrever a formatação do
    // corpo — só apara as pontas. (Regressão da normalização global removida.)
    const input = "Olá {nome},\n\n\nSua consulta:  {data}  às  {hora}.";
    expect(stripResponseInstruction(input)).toBe(input);
  });

  it("does not leave a double space when removing an instruction mid-text", () => {
    const input =
      "Confirme. Responda 1 para CONFIRMAR ou 2 para CANCELAR agora, obrigado.";
    // A remoção consome o espaço antes do verbo; sobra espaço único, sem colapso global.
    expect(stripResponseInstruction(input)).toBe("Confirme. agora, obrigado.");
  });
});

describe("withResponseInstruction", () => {
  it("appends the canonical instruction to a body", () => {
    const body = "Olá {nome}, consulta em {data} às {hora}.";
    expect(withResponseInstruction(body)).toBe(
      `${body}\n\n${RESPONSE_INSTRUCTION}`,
    );
  });

  it("is idempotent — applying twice does not duplicate the instruction", () => {
    const body = "Olá {nome}, consulta em {data}.";
    const once = withResponseInstruction(body);
    expect(withResponseInstruction(once)).toBe(once);
  });

  it("corrects a body that already carries a WRONG instruction", () => {
    const body = "Olá {nome}. Responda 2 para CONFIRMAR ou 5 para CANCELAR.";
    expect(withResponseInstruction(body)).toBe(
      `Olá {nome}.\n\n${RESPONSE_INSTRUCTION}`,
    );
  });

  it("falls back to just the instruction when the body is only an instruction", () => {
    expect(withResponseInstruction(RESPONSE_INSTRUCTION)).toBe(RESPONSE_INSTRUCTION);
  });
});
