import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { PhoneInput } from "@/components/ui/phone-input";

// Wrapper controlado igual ao uso real (Controller do RHF): guarda o canônico
// e re-renderiza o display a cada mudança.
function Controlled() {
  const [value, setValue] = useState("");
  return <PhoneInput value={value} onChange={setValue} data-testid="phone" />;
}

// Digita um dígito por vez no PhoneInput REAL — exercita handleChange +
// formatPhoneDisplay do componente (não uma cópia da lógica), pegando qualquer
// regressão na fiação value↔onChange que reintroduza o bug do "(55) 1".
function typeInto(input: HTMLInputElement, digits: string) {
  for (const ch of digits) {
    fireEvent.change(input, { target: { value: input.value + ch } });
  }
}

describe("<PhoneInput> round-trip controlado (regressão '+55' acumulando)", () => {
  it("digitar 1 dígito mostra '(1', não '(55) 1'", () => {
    render(<Controlled />);
    const input = screen.getByTestId("phone") as HTMLInputElement;
    typeInto(input, "1");
    expect(input.value).toBe("(1");
  });

  it("digitar um celular completo, tecla a tecla, formata certo", () => {
    render(<Controlled />);
    const input = screen.getByTestId("phone") as HTMLInputElement;
    typeInto(input, "11987654321");
    expect(input.value).toBe("(11) 98765-4321");
  });

  it("número de DDD 55 (Santa Maria/RS) não perde o DDD", () => {
    render(<Controlled />);
    const input = screen.getByTestId("phone") as HTMLInputElement;
    typeInto(input, "55999998888");
    expect(input.value).toBe("(55) 99999-8888");
  });
});
