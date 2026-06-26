"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { centsToDisplay, rawToCents, valueToCents } from "@/lib/currency-mask"

/**
 * Input monetário com **máscara acumuladora de centavos** (preenche da direita
 * para a esquerda, padrão BR): digitar `5` → `0,05`, `57` → `0,57`, `573` →
 * `5,73`, … até o limite de **99.999,99** (7 dígitos). Backspace remove 1 dígito.
 *
 * Contrato preservado: `value`/`onChange` em **reais** (number). Lógica pura da
 * máscara em `src/lib/currency-mask.ts`. Usado no "valor médio do atendimento".
 */

type CurrencyInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: number | undefined
  onChange: (value: number) => void
  invalid?: boolean
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput({ className, value, onChange, invalid, ...props }, ref) {
    const display = centsToDisplay(valueToCents(value))

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // O texto exibido é sempre os centavos formatados; basta re-extrair os
      // dígitos do valor pós-edição (cobre digitar E backspace) e reinterpretar.
      onChange(rawToCents(e.target.value) / 100)
    }

    return (
      <div
        className={cn(
          "flex items-center rounded-lg border bg-input/10 transition-all duration-200 shadow-xs h-10",
          "border-input/20 focus-within:border-primary/50 focus-within:bg-input/20 focus-within:ring-2 focus-within:ring-primary/20",
          invalid && "border-destructive ring-destructive/20",
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="pl-3 pr-2 text-sm font-medium text-muted-foreground select-none"
        >
          R$
        </span>
        <input
          {...props}
          ref={ref}
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          aria-invalid={invalid || undefined}
          className="flex-1 bg-transparent outline-none text-base md:text-sm placeholder:text-muted-foreground pr-3 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    )
  },
)

export { CurrencyInput }
