"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { formatPhoneDisplay, getLocalDigits, toCanonicalPhone } from "@/lib/phone"

type PhoneInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  /** Canonical value: "+5511999999999" (or "" while empty). */
  value?: string
  /** Receives canonical value. */
  onChange?: (canonical: string) => void
  invalid?: boolean
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  function PhoneInput({ className, value = "", onChange, invalid, ...props }, ref) {
    const display = formatPhoneDisplay(value)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = toCanonicalPhone(e.target.value)
      onChange?.(next)
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
          className="pl-3 pr-2 text-sm font-medium text-muted-foreground select-none border-r border-input/20 mr-2 h-full flex items-center"
        >
          🇧🇷 +55
        </span>
        <input
          {...props}
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={display}
          onChange={handleChange}
          maxLength={16}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex-1 bg-transparent outline-none text-base md:text-sm placeholder:text-muted-foreground pr-3 disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
      </div>
    )
  },
)

export { PhoneInput, formatPhoneDisplay, getLocalDigits, toCanonicalPhone }
