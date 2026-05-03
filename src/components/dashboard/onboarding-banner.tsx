"use client"

import Link from "next/link"
import { useState } from "react"
import { useSettings, usePatients } from "@/hooks/use-api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, Circle, Sparkles, X } from "lucide-react"

const DISMISS_KEY = "clinica-organizada:onboarding-dismissed"

export function OnboardingBanner() {
  const { data: settings } = useSettings()
  const { data: patients } = usePatients()
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(DISMISS_KEY) === "1"
  })

  if (dismissed) return null
  if (!settings || !patients) return null

  const hasValue = (settings.avgAppointmentValue ?? 0) > 0
  const hasPatients = patients.length > 0
  const completed = [hasValue, hasPatients].filter(Boolean).length
  const total = 2

  // All done — hide automatically.
  if (completed === total) return null

  const handleDismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-teal-500/5">
      <CardContent className="p-5 flex items-start gap-4">
        <div className="rounded-full bg-primary/15 p-2.5 shrink-0">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="font-semibold">
              Vamos configurar sua conta ({completed}/{total})
            </p>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dispensar"
              className="text-muted-foreground/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              {hasValue ? (
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={hasValue ? "text-muted-foreground line-through" : ""}>
                Defina o valor médio da consulta
              </span>
              {!hasValue && (
                <Link
                  href="/configuracoes"
                  className="ml-auto text-xs text-primary hover:underline font-medium"
                >
                  Configurar →
                </Link>
              )}
            </li>
            <li className="flex items-center gap-2">
              {hasPatients ? (
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={hasPatients ? "text-muted-foreground line-through" : ""}>
                Cadastre seu primeiro paciente
              </span>
              {!hasPatients && (
                <Link
                  href="/pacientes"
                  className="ml-auto text-xs text-primary hover:underline font-medium"
                >
                  Cadastrar →
                </Link>
              )}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
