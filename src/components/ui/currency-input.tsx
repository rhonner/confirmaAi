"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type CurrencyInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: number | undefined
  onChange: (value: number) => void
  invalid?: boolean
}

function formatBRL(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return ""
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput({ className, value, onChange, invalid, ...props }, ref) {
    const [text, setText] = React.useState(formatBRL(value))

    React.useEffect(() => {
      // Sync from outside (e.g., reset / async load) only if numeric value differs.
      const parsed = parseInput(text)
      if (parsed !== value) setText(formatBRL(value))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d,.]/g, "")
      setText(raw)
      const parsed = parseInput(raw)
      onChange(parsed)
    }

    const handleBlur = () => {
      setText(formatBRL(parseInput(text)))
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
          inputMode="decimal"
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={invalid || undefined}
          className="flex-1 bg-transparent outline-none text-base md:text-sm placeholder:text-muted-foreground pr-3 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    )
  },
)

function parseInput(raw: string): number {
  if (!raw) return 0
  // Accept "1.234,56" / "1,234.56" / "1234.56" / "1234,56" / "1234"
  const onlyNums = raw.replace(/[^\d,.]/g, "")
  // If both . and , exist, assume the LAST one is the decimal separator.
  const lastDot = onlyNums.lastIndexOf(".")
  const lastComma = onlyNums.lastIndexOf(",")
  let normalized: string
  if (lastDot === -1 && lastComma === -1) {
    normalized = onlyNums
  } else if (lastComma > lastDot) {
    normalized = onlyNums.replace(/\./g, "").replace(",", ".")
  } else {
    normalized = onlyNums.replace(/,/g, "")
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

export { CurrencyInput }
