# Graph Report - /Users/rennohr/development/not-work/saas1  (2026-07-26)

## Corpus Check
- 84 files · ~292,216 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2042 nodes · 4189 edges · 172 communities (100 shown, 72 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 85 edges (avg confidence: 0.79)
- Token cost: 399,741 input · 0 output

## Community Hubs (Navigation)
- Identity, Quota & Entitlements
- Google OAuth (PKCE)
- Feature Registry (.context)
- Auth & Email-Verify Routes
- BM25 Search Engine (skill)
- Asaas Billing Provider
- API Route Handlers & Helpers
- Patient & Usage UI Components
- Wiki Concepts & Gotchas
- Raw Session Logs (Google Calendar)
- Dashboard Shell & Guards
- Google OAuth (PKCE)
- Auth Routes, Scripts & Observability
- Admin Layout & Routes
- Project Docs & Agent Rules
- Feature Mechanisms (GCal/Billing/Pacientes)
- System Flow (onboarding→confirm)
- TypeScript Config Globs
- Ops Scripts (gcal/beta)
- Admin Audit Pages
- Login & Auth Pages
- Agenda Grid & Appointment Rules
- Agenda & Appointment Form
- CRUD API Routes
- Phone Input & Normalization
- Patient & Usage UI Components
- Checkout & Billing Pages
- Billing Provider & Scheduler Jobs
- Raw Sessions — Agenda & Auth
- Audit & Billing Models
- Agenda & Appointment Form
- Paywall & Export UI
- WhatsApp, Webhook & Settings Docs
- Scheduler & Billing Maintenance
- API Routes (POST)
- Patient Schema & Routes
- Dashboard & Layout
- shadcn/ui Config
- Paywall & Export UI
- Google Calendar Read API
- Playwright E2E Specs
- CSV Export Routes (RFC-4180)
- Message Template Assembly
- Time Select Component
- Dev-with-Agents Workflow
- npm Scripts (package.json)
- lib/auth.ts
- Birthday Logic & Dashboard API
- Evolution Webhook Parser
- Dev Dependencies
- Checkout & Billing Pages
- Dashboard UI & Birthdays Card
- Time Select Component
- Seed & Backfill Scripts
- Template Editor (TipTap)
- Seed & Backfill Scripts
- Seed & Backfill Scripts
- Paywall & Export UI
- Audit Prisma Extension
- Onboarding Terminology & Dashboard Docs
- Confirmation Token (HMAC)
- API Routes & Legal Pages
- Account Reset & Subscription
- Gender Labels & Patient CSV Export
- Confirmation Link Page
- Root Layout & Fonts
- Google Mirror (Fase C) Docs
- Cron Cadence & Scheduler Firewall Docs
- Runtime Dependencies (bcrypt/pg)
- Currency Mask Input
- Retroactive & Appointment Status
- Patient Profile & Partial Updates
- Patients & Quota Feature
- Agenda Page (snapshot)
- Claude Code Hooks
- package.json Metadata
- Agenda & Appointment Form
- NextAuth Types
- Wiki Operations
- OAuth & Quota Rationale
- Neon Scale-to-Zero & Health
- Agenda Day/Week & Phone Fix
- Architecture Core (stack)
- Dev Tunnel Script
- disposable-emails.ts
- Agenda Failure Screenshot
- Deploy/Migration Gotchas
- NextAuth Gotchas
- Prisma Client & Login Diagnose
- Core Data Models
- GET API Routes
- Dashboard Metrics Test
- Beta Override Entitlement
- CPF/CNPJ Owner Document
- Architecture Core (stack)
- Prod Migration Script
- Wiki Status Script
- GCal Patch/Revive Gotchas
- Phone Mask & RHF Gotchas
- Currency Mask Accumulator
- auth/prisma-adapter
- day-grid.tsx
- wiki-ingest command
- clsx
- cmdk
- date-fns
- date-fns-tz
- eslint.config.mjs
- Dev Dependencies
- hookform/resolvers
- lucide-react
- next
- next-auth
- next.config.ts
- next-themes
- node-cron
- prisma
- prisma/adapter-pg
- radix-ui
- react-dom
- react-hook-form
- recharts
- sentry/nextjs
- sonner
- tailwind-merge
- tanstack/react-query
- tiptap/pm
- tiptap/react
- tiptap/starter-kit
- zustand
- playwright/test
- shadcn
- tailwindcss
- tailwindcss/postcss
- @testing-library/jest-dom
- tsx
- tw-animate-css
- types/bcryptjs
- types/node
- types/node-cron
- types/react
- typescript
- vitejs/plugin-react
- PostCSS Config
- Brand Icon Assets
- Next.js/Vercel Logos
- Design System Spec
- Navigation E2E Spec
- Vercel Cron Config
- Feature Registry (.context)
- Session Checkpoint Script
- Link GET Anti-Prefetch
- Next Stale-CSS Gotcha
- next-themes System Default
- Scrollbar Gutter Fix
- Claude Agents & Skills
- Claude Agents & Skills
- Claude Agents & Skills
- Next.js Starter Icon (file)
- Next.js Starter Icon (globe)
- Next.js Starter Icon (window)
- Session Note Template
- Feature Registry (.context)
- Feature Registry (.context)
- Feature Registry (.context)
- Feature Registry (.context)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 124 edges
2. `audit()` - 45 edges
3. `getAuthSession()` - 40 edges
4. `unauthorizedResponse()` - 33 edges
5. `serverErrorResponse()` - 33 edges
6. `ApiResponse` - 32 edges
7. `fetchApi()` - 31 edges
8. `Monetization v2 state snapshot` - 30 edges
9. `Button()` - 28 edges
10. `Orquestrador de Contexto (.context/README.md)` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Webhook tenant isolation fix` --semantically_similar_to--> `findPendingAppointmentForResponse (FIFO match)`  [INFERRED] [semantically similar]
  .ralph/specs/security-fixes.md → .context/features/webhook-evolution.md
- `Tailwind v4 button cursor (Preflight zeroes button cursor)` --semantically_similar_to--> `UI anti-patterns (no emojis as icons, cursor:pointer, no horizontal scroll)`  [INFERRED] [semantically similar]
  .wiki/raw/sessions/2026-06-27-paonetone-ui-feedback.md → design-system/confirmaaí/MASTER.md
- `Brand palette (cyan + health green #10b981)` --semantically_similar_to--> `Design system color palette (cyan + health green)`  [INFERRED] [semantically similar]
  BRAND.md → design-system/confirmaaí/MASTER.md
- `ConfirmaAí app favicon/icon (teal rounded-square calendar mark)` --semantically_similar_to--> `ConfirmaAí brand mark (calendar + checkmark logo)`  [INFERRED] [semantically similar]
  src/app/icon.svg → public/brand/logo-mark.svg
- `ARCHITECTURE.md — visão geral (monolito Next.js 16)` --semantically_similar_to--> `Stack REAL declarada no CLAUDE.md`  [INFERRED] [semantically similar]
  ARCHITECTURE.md → CLAUDE.md

## Import Cycles
- 4-file cycle: `src/lib/audit/index.ts -> src/lib/audit/route-wrapper.ts -> src/lib/auth-helpers.ts -> src/lib/auth.ts -> src/lib/audit/index.ts`

## Hyperedges (group relationships)
- **Firewall: o que o scheduler pode varrer (Appointment não-retroativo)** — _context_features_scheduler_mark_no_shows, _context_features_scheduler_retroactive_invariant, _context_features_google_calendar_externalevent_firewall, _context_features_time_blocks_separate_table_firewall, _context_features_appointments_retroactive [EXTRACTED 1.00]
- **Fluxo de confirmação: envio, deadline, resposta e no-show** — _context_features_scheduler_send_confirmations, _context_features_scheduler_auto_cancel_unconfirmed, _context_features_scheduler_mark_no_shows, _context_flows_confirmation_flow_link_confirmation, _context_flows_confirmation_flow_fifo_match, _context_features_scheduler_with_response_instruction [EXTRACTED 1.00]
- **Espelho app→Google (Fase C): orquestração, tag anti-loop, id determinístico e gate** — _context_features_google_calendar_mirror, _context_features_google_calendar_calendar_client, _context_features_google_calendar_anti_loop_tag, _context_features_google_calendar_app_origin_event_id, _context_features_google_calendar_mirroring_enabled_gate, _context_features_time_blocks_mirror [EXTRACTED 1.00]
- **Validação em produção do commit 812289e (4 fixes da agenda + provas indiretas)** — _wiki_raw_sessions_2026_07_25_1100_prod_walkthrough_812289e_session, _wiki_pages_concepts_redacted_label_is_copy_not_contract_copy_not_contract, _wiki_pages_concepts_toast_timers_pause_on_hover_toast_pause_on_hover, _wiki_pages_concepts_audit_trail_proves_side_effect_absence_absence_proof, _wiki_raw_sessions_2026_07_25_0028_isprivate_and_retroactive_status_retroactive_born_classified, _wiki_pages_synthesis_google_calendar_integration_state_gcal_state [EXTRACTED 1.00]
- **Decisão de onde a linha vive: firewall por tabela separada × flag na tabela de domínio** — _wiki_pages_concepts_external_event_firewall_external_event_firewall, _wiki_pages_concepts_external_event_firewall_separate_table_vs_flag_rule, _wiki_pages_concepts_persist_intent_not_elapsed_time_persist_intent, _wiki_pages_concepts_external_event_firewall_app_origin_tag, _wiki_pages_synthesis_google_calendar_integration_state_fase_c_mirror [EXTRACTED 1.00]
- **Kit de verificação de UI no Chrome MCP (dirigir, injetar, asseverar no DOM, contornar gotchas)** — _wiki_pages_concepts_chrome_mcp_drive_and_assert_via_js_drive_and_assert, _wiki_pages_concepts_chrome_mcp_drive_and_assert_via_js_fetch_intercept_assert_payload, _wiki_pages_concepts_chrome_mcp_drive_and_assert_via_js_client_fixture_injection, _wiki_pages_concepts_chrome_mcp_drive_and_assert_via_js_resize_window_noop, _wiki_pages_concepts_toast_timers_pause_on_hover_assert_toast_in_dom, _wiki_pages_entities_radix_popover_and_dialog_first_click_swallowed [EXTRACTED 1.00]
- **Efeitos colaterais best-effort (nunca quebram o fluxo principal)** — _context_features_google_calendar_mirror, context_features_observability_capture_error, _context_features_billing_billing, context_features_lgpd_account_lgpd_account [INFERRED 0.75]
- **Lifetime patient-quota enforcement mechanism** — context_features_plan_quota_patientquotaslot, context_features_plan_quota_reserveslotintx, context_features_plan_quota_entitlements_check, context_features_plan_quota_plans_config [EXTRACTED 1.00]
- **Ralph autonomous dev loop (agent + prompt + fix_plan + bug)** — ralph_agent_instructions, ralph_prompt_instructions, ralph_fix_plan_plan, ralph_prompt_patient_creation_bug [INFERRED 0.75]
- **2026-07-19 confirmation-link + onboarding + mobile session lessons** — wiki_pages_concepts_baked_deadline_needs_grace_floor_baked_deadline_needs_grace_floor, wiki_pages_concepts_jwt_new_claim_defaults_stale_tokens_jwt_new_claim_defaults_stale_tokens, wiki_pages_concepts_horizontal_scroll_from_offscreen_elements_horizontal_scroll_from_offscreen_elements [INFERRED 0.75]
- **Billing state resilience without extra jobs (reconcile cron, lazy counter, read-time override)** — wiki_pages_concepts_defense_in_depth_cron_defense_in_depth_cron, wiki_pages_concepts_lazy_period_usage_counter_lazy_period_usage_counter, wiki_pages_concepts_entitlement_override_decoupled_from_billing_entitlement_override_decoupled_from_billing [INFERRED 0.75]
- **Google Calendar integration gotchas (OAuth callback, mirror, teardown)** — _wiki_pages_concepts_oauth_scope_check_before_persist_scope_check, _wiki_pages_concepts_oauth_state_cookie_ttl_expiry_state_ttl, _wiki_pages_concepts_patch_merge_clear_requires_explicit_empty_merge_clear, _wiki_pages_concepts_revive_cancelled_event_on_id_reuse_revive_tombstone, _wiki_pages_concepts_soft_delete_skips_cascade_cleanup_skips_cascade [INFERRED 0.75]
- **Neon serverless Postgres operational lessons (pooling, migrations, scale-to-zero cost)** — _wiki_pages_concepts_neon_pooled_vs_direct_url_pooled_vs_direct, _wiki_pages_concepts_migrations_not_auto_applied_vercel_drift, _wiki_pages_concepts_scale_to_zero_defeated_by_db_health_pings_health_pings [INFERRED 0.75]
- **Frontend UI gotchas only caught by real browser (Chrome MCP) verification** — _wiki_pages_concepts_rhf_radix_gotcha_rhf_radix, _wiki_pages_concepts_phone_mask_roundtrip_country_code_phone_mask, _wiki_pages_concepts_scrollbar_gutter_stable_gutter_stable [INFERRED 0.65]
- **Monetization v2 sprint rollout (sessions + synthesis)** — _wiki_pages_synthesis_monetization_v2_state_monetization_v2, _wiki_raw_sessions_2026_05_07_sprint_1_3_monetizacao_session_sprint_1_3, _wiki_raw_sessions_2026_05_07_sprint_4_5_monetizacao_session_sprint_4_5, _wiki_raw_sessions_2026_06_10_sprint6_and_golive_session_sprint6_golive, _wiki_raw_sessions_2026_06_12_golive_completo_e_validacao_pagamento_session_golive_pagamento, _wiki_raw_sessions_2026_06_14_migration_incident_sprint10_session_migration_incident [EXTRACTED 0.75]
- **Go-live bugs surfaced only by real traffic** — _wiki_raw_sessions_2026_06_12_golive_completo_e_validacao_pagamento_session_golive_pagamento, _wiki_pages_concepts_whatsapp_ninth_digit_jid_whatsapp_ninth_digit_jid, _wiki_pages_concepts_asaas_external_reference_in_payment_asaas_external_reference_in_payment [EXTRACTED 0.75]
- **Google Calendar integration (phases A/B/C: overlay, promotion, mirror)** — _wiki_raw_sessions_2026_07_05_google_calendar_integration_fase_a_google_calendar_integration, _wiki_raw_sessions_2026_07_05_google_calendar_integration_fase_a_external_event_firewall, _wiki_raw_sessions_2026_07_10_1447_gcal_phase_b_promotion_external_event_model, _wiki_raw_sessions_2026_07_10_1900_gcal_phase_c_mirror_appointment_mirror_to_google [INFERRED 0.85]
- **Paonetone UI/UX feedback fixes (CSS + editor concepts)** — _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_autofill_highlight_css, _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_tailwind_v4_button_cursor, _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_tiptap_flushsync_domnodeview, _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_next_themes_default_theme [INFERRED 0.75]
- **Jornada do sistema: conta → configurar → WhatsApp → agenda → confirmação automática → no-show → dashboard** — fluxogramas_acessa_confirmaai, fluxogramas_cria_a_conta, fluxogramas_cria_conta_anti_fraude, fluxogramas_faz_login, fluxogramas_configura_a_clinica, fluxogramas_conecta_o_whatsapp, fluxogramas_cadastra_pacientes, fluxogramas_cria_agendamento, fluxogramas_cron_30_min, fluxogramas_envia_confirmacao_t24h, fluxogramas_recebe_no_whatsapp, fluxogramas_atualiza_status, fluxogramas_dashboard_atualiza, fluxogramas_acompanha_reduz_faltas [EXTRACTED 1.00]
- **Fluxo de dev com agentes: ler .context → plano → schema/contrato → backend → frontend → definição de feito + Chrome MCP → deploy → curadoria → commit** — fluxogramas_descreve_a_tarefa, fluxogramas_le_context_readme, fluxogramas_monta_plano_specs, fluxogramas_prisma_schema_migration, fluxogramas_congela_contrato_api, fluxogramas_backend_route_handlers, fluxogramas_frontend_ux, fluxogramas_definicao_de_feito, fluxogramas_passou_no_chrome, fluxogramas_deploy_na_vercel, fluxogramas_curadoria_conhecimento, fluxogramas_comita_via_gh [EXTRACTED 1.00]
- **Estratégia de monetização: níveis de assinatura, limite de 5 pacientes únicos, bloqueio/paywall e cobrança** — monetizacao_prompt_niveis_de_assinatura, monetizacao_prompt_plano_free, monetizacao_prompt_plano_pago, monetizacao_prompt_limite_5_pacientes_unicos, monetizacao_prompt_fluxo_de_bloqueio, monetizacao_prompt_cobranca_pix_cartao [EXTRACTED 1.00]
- **Generic Next.js starter-template boilerplate icons (low value)** — public_file_starter_icon, public_globe_starter_icon, public_next_starter_icon, public_vercel_starter_icon, public_window_starter_icon [INFERRED 0.85]

## Communities (172 total, 72 thin omitted)

### Community 0 - "Identity, Quota & Entitlements"
Cohesion: 0.06
Nodes (64): adapter, main(), prisma, main(), RegisterPage(), canonicalizeCnpj(), checkDigit(), CNPJ_W1 (+56 more)

### Community 1 - "Google OAuth (PKCE)"
Cohesion: 0.06
Nodes (70): check(), generateValidCpf(), main(), results, Sprint, POST(), schema, SignalsResponse (+62 more)

### Community 2 - "Feature Registry (.context)"
Cohesion: 0.06
Nodes (67): Feature: audit, Feature: auth, Feature: billing, Feature: dashboard, Feature: observability, Feature: scheduler, Feature: settings, Feature: webhook-evolution (+59 more)

### Community 3 - "Auth & Email-Verify Routes"
Cohesion: 0.07
Nodes (51): getMonthGridRange(), MonthCalendar(), MonthCalendarProps, WEEKDAY_LABELS, createVerificationToken(), hashToken(), SendResult, sendVerificationEmail() (+43 more)

### Community 4 - "BM25 Search Engine (skill)"
Cohesion: 0.06
Nodes (42): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+34 more)

### Community 5 - "Asaas Billing Provider"
Cohesion: 0.07
Nodes (16): AsaasProvider, deriveNextDueDate(), mapPaymentStatus(), mapPaymentStatus(), MockProvider, computePixExpiresAt(), _ttlRaw, BillingProviderImpl (+8 more)

### Community 6 - "API Route Handlers & Helpers"
Cohesion: 0.11
Nodes (34): DELETE, POST, bodySchema, POST, bodySchema, CheckoutResponse, POST, POST (+26 more)

### Community 7 - "Patient & Usage UI Components"
Cohesion: 0.07
Nodes (33): AlertDialogOverlay(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), CardAction() (+25 more)

### Community 8 - "Wiki Concepts & Gotchas"
Cohesion: 0.12
Nodes (46): Wiki ConfirmaAí — Índice de páginas, Remoção da detecção de conflito — sobreposição de agendamentos permitida, Poda manual de nó semântico stale (graphify update só re-extrai a camada de código), Wiki ConfirmaAí — Log append-only de ingestões, Trilha de auditoria como prova de ausência de efeito colateral, Injetar fixture no cliente para testar caminho externo sem sujar a conta real, Dirigir e asseverar a app via JS no Chrome MCP, Interceptar window.fetch para asseverar o payload que a UI manda (+38 more)

### Community 9 - "Raw Session Logs (Google Calendar)"
Cohesion: 0.05
Nodes (46): Autofill highlight CSS (:-webkit-autofill box-shadow inset), next dev serves stale CSS after build (clean .next), next-themes default theme (light default, resolvedTheme), Sessão 2026-06-27 — Paonetone UI/UX feedback (8 itens), Tailwind v4 button cursor (Preflight zeroes button cursor), Template editor chips (TipTap v3, serializes to {var}), TipTap flushSync / DOM node view (template chips editor), Dev fallback without secrets (gate reversible secret to test runner) (+38 more)

### Community 10 - "Dashboard Shell & Guards"
Cohesion: 0.06
Nodes (31): react, react, DashboardLayout(), PatientCombobox(), AppHeader(), AppHeaderProps, AppSidebar(), SessionGuard() (+23 more)

### Community 11 - "Google OAuth (PKCE)"
Cohesion: 0.11
Nodes (27): RFC-7636, main(), base64Url(), buildAuthUrl(), decodeIdTokenEmail(), exchangeCode(), expiryFrom(), generatePkcePair() (+19 more)

### Community 12 - "Auth Routes, Scripts & Observability"
Cohesion: 0.11
Nodes (19): main(), main(), bodySchema, POST, bodySchema, POST, POST, GET (+11 more)

### Community 13 - "Admin Layout & Routes"
Cohesion: 0.15
Nodes (19): AdminLayout(), GET(), AdminAccount, GET(), AUDIT_SELECT, GET(), bodySchema, POST() (+11 more)

### Community 14 - "Project Docs & Agent Rules"
Cohesion: 0.11
Nodes (29): Agente ux-writer (PO + UX writer pt-BR), Copy orientada a benefício, não a mecanismo, Invariantes de copy do projeto, Não inventar termos técnicos na UI, getSubscriptionStatusMeta (status amigável em pt-BR), Rótulo "Ramo" → "Segmento" na UI, DIRECT_URL (conexão direta Neon para DDL), Incidente 2026-06-14: migration pendente quebrou login/signup (+21 more)

### Community 15 - "Feature Mechanisms (GCal/Billing/Pacientes)"
Cohesion: 0.10
Nodes (29): canPromoteGoogleEvent (regra única de promoção), Clique em evento do Google nas grades, 'Particular' decide por isPrivate, nunca pelo rótulo 'Ocupado', Export CSV é entitlement pago (ExportCsvButton), Anti-duplicação de assinatura (cancelSubscription), POST /api/billing/checkout (Pix + cartão), CPF obrigatório no checkout (resolveCheckoutCpf), deriveNextDueDate (shape real do Asaas) (+21 more)

### Community 16 - "System Flow (onboarding→confirm)"
Cohesion: 0.08
Nodes (29): Acessa o ConfirmaAí, Acompanha e reduz faltas (upgrade PRO R$97/mês), Atualiza status (1 → CONFIRMED · 2 → CANCELED via webhook + confirmedAt), Cadastra pacientes (FREE = 5 vagas vitalícias), Conecta o WhatsApp (QR Evolution, 1 instância por conta → CONNECTED), Configura a clínica (valor médio · antecedência 24h/6h · templates), Cria a conta (nome, e-mail, senha, clínica, CPF), Cria agendamento (valida conflito + data futura → PENDING) (+21 more)

### Community 17 - "TypeScript Config Globs"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 18 - "Ops Scripts (gcal/beta)"
Cohesion: 0.09
Nodes (12): POST, detectOwnerCpfReuse(), maskEmail(), OwnerCpfDedupResult, RecaptchaResult, verifyRecaptchaToken(), checkSignupRateLimit(), hashEmail() (+4 more)

### Community 19 - "Admin Audit Pages"
Cohesion: 0.16
Nodes (20): AdminAuditPage(), fmt(), ACTOR_LABEL, PacientesPage(), PageHeader(), PageHeaderProps, Badge(), badgeVariants (+12 more)

### Community 20 - "Login & Auth Pages"
Cohesion: 0.12
Nodes (15): Form, schema, LoginForm, loginSchema, Form, schema, RegisterForm, registerSchema (+7 more)

### Community 21 - "Agenda Grid & Appointment Rules"
Cohesion: 0.12
Nodes (25): Clique × arraste decide pela mudança real com snap, Card baixo vira 1 linha (COMPACT_CARD_PX), DayGrid (grade de horas do modo Dia), dragRef como fonte de verdade do arraste, Feature: arraste na agenda (grade Dia + Mês entre dias), layoutColumns (colunas de sobreposição), moveKeepingTime (Mês preserva hora ao trocar de dia), pending anti-flicker × structural sharing do React Query (+17 more)

### Community 22 - "Agenda & Appointment Form"
Cohesion: 0.09
Nodes (24): AccountsSection(), AtividadePage(), ActivityItem, AdminAccount, AdminAuditData, AdminAuditRow, Appointment, DashboardStats (+16 more)

### Community 23 - "CRUD API Routes"
Cohesion: 0.11
Nodes (15): DELETE, PUT, POST, APP_INCLUDE, convertSchema, POST, QuotaExceededInTx, isRetroactive() (+7 more)

### Community 24 - "Phone Input & Normalization"
Cohesion: 0.14
Nodes (15): CheckoutPage(), CheckoutResponse, BillingPage(), CheckoutSuccessPage(), metadata, FEATURE_ROWS, PlanCard(), Props (+7 more)

### Community 25 - "Patient & Usage UI Components"
Cohesion: 0.12
Nodes (20): LEVEL_STYLES, MessageUsagePill(), UsageBadge(), Patient, PatientComboboxProps, Command(), CommandDialog(), CommandEmpty() (+12 more)

### Community 26 - "Checkout & Billing Pages"
Cohesion: 0.21
Nodes (18): AccountDataCard(), ResetAccountCard(), AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter() (+10 more)

### Community 27 - "Billing Provider & Scheduler Jobs"
Cohesion: 0.13
Nodes (24): Override admin / beta tester (effectivePlanTier), AsaasProvider (Brasil-first), runBillingNotifications (dunning + perto-do-limite), Gotcha do $ no .env (escape obrigatório), Feature: Billing (Subscription + provider), runBillingMaintenance (lifecycle, defesa em profundidade), MockProvider (offline/CI/mock-trigger), BillingProviderImpl (interface de provider) (+16 more)

### Community 28 - "Raw Sessions — Agenda & Auth"
Cohesion: 0.11
Nodes (23): enum BusinessType (HEALTH/AESTHETICS/BEAUTY/FINANCE/OTHER), Email normalization trim+lowercase (collision-safe migration), Horizontal scroll from offscreen elements, Block login until email verified (EmailNotVerifiedError), NextAuth credentials authorize stub, Rate-limit via audit (per account-target dimension), Sessão 2026-06-24 — Bugfix cadastro/login (4 bugs), Agenda mini-calendar (6-week fixed grid, day dots) (+15 more)

### Community 29 - "Audit & Billing Models"
Cohesion: 0.10
Nodes (23): CPF_HASH_PEPPER, entitlements.check, Identifier hashing/canonicalization (identifiers.ts), PatientQuotaSlot, Plan Quota (lifetime patient slots), PLANS config (plans.ts), reserveSlotInTx (Serializable reservation), Audit context (AsyncLocalStorage) (+15 more)

### Community 30 - "Agenda & Appointment Form"
Cohesion: 0.19
Nodes (19): AgendaPage(), AppointmentForm, appointmentSchema, canPromoteGoogleEvent(), DURATION_OPTIONS, statusOptions, fetchApi(), TimeBlock (+11 more)

### Community 31 - "Paywall & Export UI"
Cohesion: 0.17
Nodes (15): ExportCsvButton(), KNOWN_REASONS, PaywallModal(), PaywallModalProps, PaywallReason, TITLES, DOCS, Dialog() (+7 more)

### Community 32 - "WhatsApp, Webhook & Settings Docs"
Cohesion: 0.12
Nodes (21): Configurações (Settings feature), Currency mask input (avgAppointmentValue), RESPONSE_INSTRUCTION fixed system block, TipTap chips template editor, UnsavedChangesGuard, brPhoneCandidates (nono dígito fix), buildConfirmationAck, findPendingAppointmentForResponse (FIFO match) (+13 more)

### Community 33 - "Scheduler & Billing Maintenance"
Cohesion: 0.16
Nodes (16): onRequestError(), register(), appBaseUrl(), autoCancelUnconfirmed(), CONFIRMATION, effectiveDeadlineMs(), startScheduler(), logQuotaBlockedOnce() (+8 more)

### Community 34 - "API Routes (POST)"
Cohesion: 0.18
Nodes (13): GET, DisconnectResponse, POST, isPatientPurgeDue(), runAccountPurge(), revokeGoogleGrant(), decodeKey(), decryptToken() (+5 more)

### Community 35 - "Patient Schema & Routes"
Cohesion: 0.10
Nodes (15): DELETE, PUT, POST, QuotaExceededInTx, PaginatedResponse, PatientResponse, birthDateSchema, cpfSchema (+7 more)

### Community 36 - "Dashboard & Layout"
Cohesion: 0.14
Nodes (13): LogoMark(), HOURS, MINUTES, splitTime(), TimeSelect, TimeSelectProps, AppSidebarProps, navigation (+5 more)

### Community 37 - "shadcn/ui Config"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 38 - "Paywall & Export UI"
Cohesion: 0.17
Nodes (12): metadata, Status, QuotaBanner(), OnboardingBanner(), Button(), useSettings(), useTerminology(), BUSINESS_TYPE_LABELS (+4 more)

### Community 39 - "Google Calendar Read API"
Cohesion: 0.23
Nodes (14): AuditContext, getAuditContext(), getOrSystemContext(), requireAuditContext(), runWithAuditContext(), storage, SYSTEM_CONTEXT, AuditEventInput (+6 more)

### Community 40 - "Playwright E2E Specs"
Cohesion: 0.18
Nodes (11): TIMES, last9, PATIENT, PATIENT_UPDATED, tomorrow, displayPhone(), expectTime(), fillPhoneInput() (+3 more)

### Community 41 - "CSV Export Routes (RFC-4180)"
Cohesion: 0.18
Nodes (12): RFC-4180, GET(), STATUS_LABEL, GcalEventsResponse, GET(), querySchema, paywallResponse(), buildCsv() (+4 more)

### Community 42 - "Message Template Assembly"
Cohesion: 0.19
Nodes (13): ConfirmarPage(), formatAppointmentDate(), formatAppointmentTime(), formatMessage(), MessageData, stripResponseInstruction(), withConfirmationLink(), withResponseInstruction() (+5 more)

### Community 43 - "Time Select Component"
Cohesion: 0.14
Nodes (13): CellItem, DragState, minutesOfDay(), MonthAppointment, MonthView(), MonthViewProps, moveKeepingTime(), statusDotClass() (+5 more)

### Community 44 - "Dev-with-Agents Workflow"
Cohesion: 0.15
Nodes (17): Aprova deploy + migration? (checkpoint humano), Aprova o plano? (checkpoint humano), Aprova schema + contratos? (checkpoint humano), Backend: route handlers (src/app/api · Zod · filtro por userId · await params), Code review passou? (sem vazamento entre tenants · inputs validados · sem N+1), Você comita via gh (os agentes não commitam), Congela o contrato de API ({ data } + Zod), Curadoria de conhecimento (wiki-ingest + atualiza .context) (+9 more)

### Community 45 - "npm Scripts (package.json)"
Cohesion: 0.12
Nodes (16): scripts, build, db:generate, db:migrate, db:migrate:deploy, db:seed, db:studio, dev (+8 more)

### Community 46 - "lib/auth.ts"
Cohesion: 0.17
Nodes (11): handler, authOptions, EmailNotVerifiedError, extractIp(), readHeader(), LoginInput, loginSchema, RegisterInput (+3 more)

### Community 47 - "Birthday Logic & Dashboard API"
Cohesion: 0.34
Nodes (13): GET(), ageOn(), BirthdayPerson, brToIso(), daysInMonth(), daysUntilBirthday(), isBirthdayOn(), isLeapYear() (+5 more)

### Community 48 - "Evolution Webhook Parser"
Cohesion: 0.17
Nodes (9): EvolutionEvent, POST, maskEmail(), maskPhone(), truncateMessage(), findPendingAppointmentForResponse(), CANCEL_KEYWORDS, CONFIRM_KEYWORDS (+1 more)

### Community 49 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): eslint, jsdom, devDependencies, eslint, jsdom, @testing-library/react, ts-node, @types/pg (+7 more)

### Community 50 - "Checkout & Billing Pages"
Cohesion: 0.19
Nodes (11): ConfiguracoesPage(), formatTemplatePreview(), SettingsForm, settingsSchema, TemplatePreview(), CALLBACK_ERROR_MESSAGES, GoogleCalendarConnection(), useGoogleCalendarConnect() (+3 more)

### Community 51 - "Dashboard UI & Birthdays Card"
Cohesion: 0.20
Nodes (11): computeWeeklyTrend(), DashboardPage(), UpcomingAppointments(), BirthdaysCard(), BirthdayToday, BirthdayUpcoming, dayMonth(), firstName() (+3 more)

### Community 52 - "Time Select Component"
Cohesion: 0.19
Nodes (13): DayGrid(), DayGridProps, DragState, fmtMinLabel(), googleDurationMin(), GridAppointment, GridBlock, GridGoogleEvent (+5 more)

### Community 53 - "Seed & Backfill Scripts"
Cohesion: 0.27
Nodes (9): PhoneInput, PhoneInputProps, brPhoneCandidates(), digitsOnly(), formatPhoneDisplay(), getLocalDigits(), isValidPhone(), toCanonicalPhone() (+1 more)

### Community 54 - "Template Editor (TipTap)"
Cohesion: 0.18
Nodes (12): InlineJSON, lineToInline(), parse(), TEMPLATE_VARS, TemplateEditor, TemplateEditorHandle, TemplateEditorProps, TemplateVar (+4 more)

### Community 55 - "Seed & Backfill Scripts"
Cohesion: 0.24
Nodes (12): checkEvolutionHealth(), connectInstance(), ConnectionState, createInstance(), CreateInstanceResult, deleteInstance(), evoFetch(), EvolutionConfig (+4 more)

### Community 56 - "Seed & Backfill Scripts"
Cohesion: 0.23
Nodes (10): GET(), EvolutionHealth, evaluateHealth(), HealthInputs, HealthReport, HealthStatus, runHealthChecks(), baseInputs() (+2 more)

### Community 57 - "Paywall & Export UI"
Cohesion: 0.21
Nodes (11): cpfFormSchema, ExistingPatient, PatientForm, PatientFormDialog(), PatientFormDialogProps, patientSchema, PaywallError, useCreatePatient() (+3 more)

### Community 58 - "Audit Prisma Extension"
Cohesion: 0.21
Nodes (10): ACTION_BY_OP, AUDITED_MODELS, auditExtension, camelize(), ModelDelegate, readOne(), redact(), redactArgs() (+2 more)

### Community 59 - "Onboarding Terminology & Dashboard Docs"
Cohesion: 0.20
Nodes (12): Terminologia por segmento (Paciente vs Cliente), Card "Aniversariantes de hoje", Feature: Dashboard (métricas agregadas), OnboardingBanner (WhatsApp/pacientes/agendamentos pendentes), Boundaries e labels de semana em America/Sao_Paulo, Feature: Onboarding wizard + terminologia por ramo, JWT stale forçava o wizard na base logada, Só RÓTULOS de UI mudam (não renomear código/rotas/modelos) (+4 more)

### Community 60 - "Confirmation Token (HMAC)"
Cohesion: 0.30
Nodes (9): bodySchema, POST(), b64(), ConfirmationVerify, makeConfirmationToken(), secret(), sign(), unb64() (+1 more)

### Community 61 - "API Routes & Legal Pages"
Cohesion: 0.27
Nodes (6): metadata, metadata, LegalPage(), LegalSection, PRIVACY_SECTIONS, TERMS_SECTIONS

### Community 62 - "Account Reset & Subscription"
Cohesion: 0.31
Nodes (7): POST, GET(), SubscriptionResponse, resetBlockMessage(), resetEligibility, ResetEligibilityReason, hasAdminOverride()

### Community 63 - "Gender Labels & Patient CSV Export"
Cohesion: 0.38
Nodes (8): GET(), formatGender(), formatSex(), GENDER_LABELS, GENDER_OPTIONS, normalizeGender(), SEX_LABELS, SEX_OPTIONS

### Community 64 - "Confirmation Link Page"
Cohesion: 0.24
Nodes (4): metadata, ConfirmActions(), Result, getStatusLabel()

### Community 65 - "Root Layout & Fonts"
Cohesion: 0.24
Nodes (6): geistMono, metadata, plusJakarta, Providers(), Toaster(), TooltipProvider()

### Community 66 - "Google Mirror (Fase C) Docs"
Cohesion: 0.28
Nodes (9): appOriginEventId (id determinístico, insert idempotente), Evento vai para a agenda da conta CONECTADA, Backfill preguiçoso do espelho, mirror.ts (Fase C: espelho Appointment→Google), mirroringEnabled (CONNECTED + hasWriteScope + gcal.push), patch tem merge semantics: description sempre explícita, Ressuscitar evento cancelado no 409 (reabertura), syncPatientRename (renome do paciente re-patcha eventos) (+1 more)

### Community 67 - "Cron Cadence & Scheduler Firewall Docs"
Cohesion: 0.28
Nodes (9): calendar.ts (primitivos Google, nunca toca Appointment), Firewall ExternalEvent (evento do Google nunca vira Appointment por sync), Cadência real do cron em produção, Feature: Scheduler / Cron jobs, Single-instance / janela de race no envio, Chunking (200) + time-budget 45s + índices cross-tenant, TimeBlock em tabela separada (firewall do scheduler), Evolution API na VPS Hetzner + Caddy + crontab (+1 more)

### Community 68 - "Runtime Dependencies (bcrypt/pg)"
Cohesion: 0.22
Nodes (9): bcryptjs, dependencies, bcryptjs, pg, @tiptap/extension-placeholder, zod, pg, @tiptap/extension-placeholder (+1 more)

### Community 69 - "Currency Mask Input"
Cohesion: 0.43
Nodes (5): CurrencyInput, CurrencyInputProps, centsToDisplay(), rawToCents(), valueToCents()

### Community 70 - "Retroactive & Appointment Status"
Cohesion: 0.29
Nodes (7): isRetroactive(dateTime) — regra única no servidor, Retroativo — agendar no passado, Retroativo nasce classificado (sem PENDING), Toast só na TRANSIÇÃO para retroativo, AppointmentStatus (PENDING→CONFIRMED|NOT_CONFIRMED|CANCELED|NO_SHOW), Métricas (confirmationRate, noShowRate, estimatedLoss), Diagrama de estados do Appointment.status

### Community 71 - "Patient Profile & Partial Updates"
Cohesion: 0.29
Nodes (7): status entra no PUT só se mudou, Ações unificadas nas 3 visões (janela de edição é o único lugar de ação), model Subscription (1 user = 1 subscription), diff-then-redact na auditoria, normalizeGender é PÓS-MERGE no PUT, Perfil: nascimento, sexo e identidade de gênero, Sexo ≠ identidade de gênero (3 campos separados)

### Community 72 - "Patients & Quota Feature"
Cohesion: 0.38
Nodes (7): Ralph Agent Build Instructions, Ralph Fix Plan (E2E fixes & bug resolution), Ralph Development Instructions, Patient creation bug (empty-string email / duplicate phone 500), Ralph status block / EXIT_SIGNAL, AlertDialog delete confirmation (replace window.confirm), Frontend UX Polish Spec

### Community 73 - "Agenda Page (snapshot)"
Cohesion: 0.38
Nodes (7): Page actions (Exportar CSV, Novo Agendamento) and Pro plan badge, Agenda page (weekly appointment management view), Empty-state 'Nenhum agendamento nesta semana' (likely failure cause: no seeded appointments shown), Agenda filters (Todos os status, Todos os pacientes), Playwright failure screenshot: Agenda 'should display seeded appointments', Sidebar navigation (Dashboard, Agenda, Pacientes, Plano, Configurações), Week navigation controls (21 jun - 27 jun 2026, Anterior/Hoje/Próxima)

### Community 74 - "Claude Code Hooks"
Cohesion: 0.33
Nodes (5): hooks, SessionEnd, SessionStart, UserPromptSubmit, $schema

### Community 75 - "package.json Metadata"
Cohesion: 0.33
Nodes (5): name, prisma, seed, private, version

### Community 76 - "Agenda & Appointment Form"
Cohesion: 0.40
Nodes (5): WhatsappConnection(), WhatsappDisconnectedBanner(), useWhatsappConnect(), useWhatsappDisconnect(), useWhatsappStatus()

### Community 77 - "NextAuth Types"
Cohesion: 0.33
Nodes (5): JWT, next-auth, next-auth/jwt, Session, User

### Community 78 - "Wiki Operations"
Cohesion: 0.33
Nodes (6): Wiki page template / frontmatter, Wiki INGEST operation, Wiki LINT operation, Wiki Operational Manual (AGENTS), Wiki QUERY operation, Wiki Overview (README)

### Community 79 - "OAuth & Quota Rationale"
Cohesion: 0.40
Nodes (5): Validar escopo concedido ANTES de gravar a conexao (sem meio conectado), TTL curto do cookie de state/PKCE derruba consent lento, Documento do dono - alargar de CPF para CPF-ou-CNPJ sem quebrar o anti-fraude, Quota ledger com slot vitalicio, Soft-delete nao dispara onDelete:Cascade - credenciais externas ficam orfas

### Community 80 - "Neon Scale-to-Zero & Health"
Cohesion: 0.50
Nodes (5): Claude-in-Chrome is per-profile extension, GET /api/health/live liveness endpoint (no DB touch), Neon Postgres (prod DB, managed via Vercel, Free 100 CU-hrs), Scale-to-zero defeated by DB health pings, Sessão 2026-06-26 — Corte de custo Neon (scale-to-zero)

### Community 81 - "Agenda Day/Week & Phone Fix"
Cohesion: 0.40
Nodes (5): Agenda Dia/Semana toggle, Phone mask roundtrip country code bug, Sessão 2026-06-27-2252 — Paonetone round 2 + fix telefone, Webhook idempotency via unique constraint (dedup message-id, open), WhatsApp reply FIFO match and ack

### Community 82 - "Architecture Core (stack)"
Cohesion: 0.40
Nodes (5): message-template unit tests (11 tests), Bug: invalid Prisma client provider (prisma-client vs prisma-client-js), QA_REPORT.md — initial QA validation report, webhook-parser unit tests (25 tests), Bug: Zod .errors vs .issues (6 API routes)

### Community 83 - "Dev Tunnel Script"
Cohesion: 0.50
Nodes (3): asaas(), cleanup(), dev-tunnel.sh script

### Community 84 - "disposable-emails.ts"
Cohesion: 0.70
Nodes (3): DISPOSABLE_DOMAINS, disposableDomainCount(), isDisposableEmail()

### Community 85 - "Agenda Failure Screenshot"
Cohesion: 0.50
Nodes (5): ConfirmaAí Agenda page (Gerencie seus agendamentos) with Exportar CSV and Novo Agendamento actions, Empty state: 'Nenhum agendamento nesta semana' for week 21 jun - 27 jun 2026 (no seeded appointments shown), Playwright failure screenshot: Agenda should display seeded appointments (chromium retry1), Sidebar nav (Clínica Organizada): Dashboard, Agenda active, Pacientes, Plano, Configurações, Week navigation and filters: Anterior/Hoje/Próxima, Todos os status, Todos os pacientes

### Community 86 - "Deploy/Migration Gotchas"
Cohesion: 0.50
Nodes (4): Vercel nao aplica migrations no deploy (drift silencioso), Neon - URL pooled (runtime) vs direta (migrations), Dependencia opcional via import dinamico gated por env, Health check com DB + uptime monitor frequente derruba o scale-to-zero

### Community 87 - "NextAuth Gotchas"
Cohesion: 0.50
Nodes (4): NextAuth v4 CredentialsProvider - authorize fica em .options.authorize, NextAuth v4 - getServerSession descarta escrita de cookie do callback jwt, Rate limit via AuditLog (sem Redis), Guard de resposta assincrona obsoleta (ref-espelho do contexto ativo)

### Community 88 - "Prisma Client & Login Diagnose"
Cohesion: 0.50
Nodes (3): @prisma/client, @prisma/client, main()

### Community 89 - "Core Data Models"
Cohesion: 0.50
Nodes (4): API routes task (auth, patients, appointments, dashboard, settings), Prisma schema + seed task (models, enums, indexes), Scheduler + WhatsApp integration task, PROGRESS.md — teammate progress tracking

### Community 91 - "Dashboard Metrics Test"
Cohesion: 0.50
Nodes (3): AppointmentStatus, AppointmentStatusType, MockAppointment

### Community 92 - "Beta Override Entitlement"
Cohesion: 1.00
Nodes (3): effectivePlanTier() — override active → PREMIUM at 4 gates, Entitlement override decoupled from billing, Sessão 2026-06-26 — Flag de beta tester (premium cortesia)

### Community 93 - "CPF/CNPJ Owner Document"
Cohesion: 1.00
Nodes (3): Identifier hash namespacing (cpf:/cnpj: dispatch preserves compat), Owner document accepts CPF or CNPJ (single auto-detect field), Sessão 2026-06-26 — Documento do dono CPF ou CNPJ

### Community 94 - "Architecture Core (stack)"
Cohesion: 0.67
Nodes (3): README.md — ConfirmaAí, Confirmation flow (24h before, respond 1/2, no-show), Stack (Next.js 16, Prisma v7, NextAuth v4, Evolution, node-cron)

## Knowledge Gaps
- **528 isolated node(s):** `$schema`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `session-checkpoint.sh script` (+523 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **72 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Runtime Dependencies (bcrypt/pg)` to `tiptap/starter-kit`, `zustand`, `Dashboard Shell & Guards`, `package.json Metadata`, `Prisma Client & Login Diagnose`, `auth/prisma-adapter`, `day-grid.tsx`, `clsx`, `cmdk`, `date-fns`, `date-fns-tz`, `hookform/resolvers`, `lucide-react`, `next`, `next-auth`, `next-themes`, `node-cron`, `prisma`, `prisma/adapter-pg`, `radix-ui`, `react-dom`, `react-hook-form`, `recharts`, `sentry/nextjs`, `sonner`, `tailwind-merge`, `tanstack/react-query`, `tiptap/pm`, `tiptap/react`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `react` connect `Dashboard Shell & Guards` to `Runtime Dependencies (bcrypt/pg)`, `Paywall & Export UI`, `Admin Audit Pages`, `Phone Input & Normalization`, `Checkout & Billing Pages`, `Paywall & Export UI`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `cn()` connect `Patient & Usage UI Components` to `Dashboard & Layout`, `Currency Mask Input`, `Paywall & Export UI`, `Dashboard Shell & Guards`, `Admin Audit Pages`, `Login & Auth Pages`, `Seed & Backfill Scripts`, `Template Editor (TipTap)`, `Phone Input & Normalization`, `Patient & Usage UI Components`, `Checkout & Billing Pages`, `Paywall & Export UI`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **What connects `$schema`, `UserPromptSubmit`, `SessionStart` to the rest of the system?**
  _528 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Identity, Quota & Entitlements` be split into smaller, more focused modules?**
  _Cohesion score 0.057946069994262765 - nodes in this community are weakly interconnected._
- **Should `Google OAuth (PKCE)` be split into smaller, more focused modules?**
  _Cohesion score 0.05524537173082574 - nodes in this community are weakly interconnected._
- **Should `Feature Registry (.context)` be split into smaller, more focused modules?**
  _Cohesion score 0.05924920850293985 - nodes in this community are weakly interconnected._