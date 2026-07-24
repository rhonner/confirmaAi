# Graph Report - saas1  (2026-07-24)

## Corpus Check
- 456 files · ~279,048 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1961 nodes · 4505 edges · 172 communities (104 shown, 68 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 88 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `261748dc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Seed & Backfill Scripts
- Patient & Usage UI Components
- Feature Registry (.context)
- Agenda & Appointment Form
- API Routes & Legal Pages
- BM25 Search Engine (skill)
- Asaas Billing Provider
- Checkout & Billing Pages
- Auth & Email-Verify Routes
- Phone Input & Normalization
- Claude Agents & Skills
- CRUD API Routes
- CSV Export Routes (RFC-4180)
- Admin Audit Pages
- Google OAuth (PKCE)
- API Routes (POST)
- Paywall & Export UI
- System Flow (onboarding→confirm)
- TypeScript Config Globs
- Scheduler & Billing Maintenance
- API Routes (POST bodies)
- Login & Auth Pages
- Google Calendar Read API
- Google Calendar Write API
- Ops Scripts (gcal/beta)
- Dashboard & Layout
- shadcn/ui Config
- React UI Components
- Admin Layout & Routes
- Playwright E2E Specs
- Test Runner (test:sprints)
- Dev-with-Agents Workflow
- Architecture Core (stack)
- npm Scripts (package.json)
- Dev Dependencies
- Settings Page & Form
- Dashboard Shell & Guards
- Patients & Quota Feature
- Audit & Billing Models
- Evolution Webhook Parser
- Confirmation Link Page
- External Event Firewall
- Confirmation Token (HMAC)
- Template Editor (TipTap)
- Audit Prisma Extension
- GET API Routes
- API Routes (GET/POST)
- Form Components (shadcn)
- Core Data Models
- WhatsApp Webhook Matching
- Token Crypto & GCal Scripts
- Root Layout & Fonts
- Billing Notifications (Dunning)
- Message Template Assembly
- Agenda Mini-calendar
- GCal OAuth Security
- Runtime Dependencies (bcrypt/pg)
- WhatsApp Resilience
- Instrumentation & Cron Bootstrap
- Email-Verify & Login Gate
- CSS/Theme Gotchas
- Plan Entitlements & Quota Gate
- Settings & Auto-cancel
- Currency Mask Input
- GCal Phase A (OAuth design)
- Brand Identity & Palette
- Scheduler Cron Cadence
- Agenda Page (snapshot)
- Neon Scale-to-Zero & Health
- GCal Anti-Loop & Write Scope
- Confirmation Link Deadline Rules
- Claude Code Hooks
- Identifier Hashing & reCAPTCHA
- package.json Metadata
- Time Select Component
- NextAuth Types
- Wiki Operations
- NextAuth Gotchas
- OAuth & Quota Rationale
- Dev Tunnel Script
- Agenda Failure Screenshot
- Deploy/Migration Gotchas
- Agenda Day/Week & Phone Fix
- Prisma Client & Login Diagnose
- Dashboard Metrics Test
- Beta Override Entitlement
- CPF/CNPJ Owner Document
- Prod Migration Script
- Wiki Status Script
- GCal Patch/Revive Gotchas
- Phone Mask & RHF Gotchas
- Currency Mask Accumulator
- auth/prisma-adapter
- class-variance-authority
- wiki-ingest command
- clsx
- cmdk
- date-fns
- date-fns-tz
- eslint.config.mjs
- eslint-config-next
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
- testing-library/jest-dom
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
- Session Checkpoint Script
- Link GET Anti-Prefetch
- Next Stale-CSS Gotcha
- next-themes System Default
- Scrollbar Gutter Fix
- Next.js Starter Icon (file)
- Next.js Starter Icon (globe)
- Next.js Starter Icon (window)
- Session Note Template
- Wiki Append-only Log
- usage.ts
- whatsapp-alerts.ts
- day-grid.tsx
- evolution.ts
- password-reset.ts
- email-verification.ts
- plans.ts
- BillingProviderImpl
- lib/auth.ts
- Mover entre dias: componentes locais, não aritmética de timestamp
- disposable-emails.ts
- ux-writer.md
- seed.ts
- recaptcha.ts
- @testing-library/jest-dom

## God Nodes (most connected - your core abstractions)
1. `cn()` - 130 edges
2. `getAuthSession()` - 60 edges
3. `main()` - 56 edges
4. `audit()` - 56 edges
5. `unauthorizedResponse()` - 53 edges
6. `serverErrorResponse()` - 51 edges
7. `Button()` - 35 edges
8. `ApiResponse` - 32 edges
9. `Monetization v2 state snapshot` - 32 edges
10. `fetchApi()` - 31 edges

## Surprising Connections (you probably didn't know these)
- `Confirmação por link (HMAC stateless token, page GET + POST, auto-cancel)` --semantically_similar_to--> `Automatic confirmation flow (24h send, webhook reply, no-show)`  [INFERRED] [semantically similar]
  .wiki/raw/sessions/2026-07-19-confirmation-link-onboarding-mobile.md → ARCHITECTURE.md
- `Confirmation flow (24h before, respond 1/2, no-show)` --semantically_similar_to--> `Automatic confirmation flow (24h send, webhook reply, no-show)`  [INFERRED] [semantically similar]
  README.md → ARCHITECTURE.md
- `Webhook tenant isolation fix` --semantically_similar_to--> `findPendingAppointmentForResponse (FIFO match)`  [INFERRED] [semantically similar]
  .ralph/specs/security-fixes.md → .context/features/webhook-evolution.md
- `Appointment conflict detection (overlap window)` --conceptually_related_to--> `Confirmação Automática E2E flow`  [INFERRED]
  .ralph/specs/backend-improvements.md → .context/flows/confirmation-flow.md
- `Tailwind v4 button cursor (Preflight zeroes button cursor)` --semantically_similar_to--> `UI anti-patterns (no emojis as icons, cursor:pointer, no horizontal scroll)`  [INFERRED] [semantically similar]
  .wiki/raw/sessions/2026-06-27-paonetone-ui-feedback.md → design-system/confirmaaí/MASTER.md

## Import Cycles
- 3-file cycle: `src/lib/audit/log.ts -> src/lib/prisma.ts -> src/lib/audit/prisma-extension.ts -> src/lib/audit/log.ts`
- 4-file cycle: `src/lib/audit/index.ts -> src/lib/audit/route-wrapper.ts -> src/lib/auth-helpers.ts -> src/lib/auth.ts -> src/lib/audit/index.ts`

## Hyperedges (group relationships)
- **Registro de features orquestrado (.context via template)** — context_readme_orchestrator, context_features__template_feature_template, context_features_auth_authentication, context_features_appointments_appointments, context_features_billing_billing [INFERRED 0.80]
- **Invariante de multi-tenancy por userId (agentes + features)** — context_readme_multi_tenancy, claude_agents_code_reviewer_code_reviewer, claude_agents_backend_architect_backend_architect, context_features_appointments_appointments, context_features_auth_authentication [INFERRED 0.80]
- **Efeitos colaterais best-effort (nunca quebram o fluxo principal)** — context_features_google_calendar_mirror, context_features_observability_capture_error, context_features_billing_billing, context_features_lgpd_account_lgpd_account [INFERRED 0.75]
- **Automatic confirmation E2E pipeline (scheduler → WhatsApp → webhook → settings)** — context_flows_confirmation_flow_flow, context_features_scheduler_scheduler, context_features_whatsapp_whatsapp, context_features_webhook_evolution_webhook, context_features_settings_configuracoes [EXTRACTED 1.00]
- **Lifetime patient-quota enforcement mechanism** — context_features_plan_quota_patientquotaslot, context_features_plan_quota_reserveslotintx, context_features_plan_quota_entitlements_check, context_features_plan_quota_plans_config [EXTRACTED 1.00]
- **Ralph autonomous dev loop (agent + prompt + fix_plan + bug)** — ralph_agent_instructions, ralph_prompt_instructions, ralph_fix_plan_plan, ralph_prompt_patient_creation_bug [INFERRED 0.75]
- **Google Calendar integration: firewall, idempotent promotion & OAuth verification** — wiki_pages_concepts_external_event_firewall_external_event_firewall, wiki_pages_concepts_idempotent_link_under_race_idempotent_link_under_race, wiki_pages_concepts_google_oauth_verification_sensitive_scope_google_oauth_verification_sensitive_scope [INFERRED 0.75]
- **2026-07-19 confirmation-link + onboarding + mobile session lessons** — wiki_pages_concepts_baked_deadline_needs_grace_floor_baked_deadline_needs_grace_floor, wiki_pages_concepts_jwt_new_claim_defaults_stale_tokens_jwt_new_claim_defaults_stale_tokens, wiki_pages_concepts_horizontal_scroll_from_offscreen_elements_horizontal_scroll_from_offscreen_elements, wiki_pages_concepts_chrome_mcp_drive_and_assert_via_js_chrome_mcp_drive_and_assert_via_js [INFERRED 0.75]
- **Billing state resilience without extra jobs (reconcile cron, lazy counter, read-time override)** — wiki_pages_concepts_defense_in_depth_cron_defense_in_depth_cron, wiki_pages_concepts_lazy_period_usage_counter_lazy_period_usage_counter, wiki_pages_concepts_entitlement_override_decoupled_from_billing_entitlement_override_decoupled_from_billing [INFERRED 0.75]
- **Google Calendar integration gotchas (OAuth callback, mirror, teardown)** — _wiki_pages_concepts_oauth_scope_check_before_persist_scope_check, _wiki_pages_concepts_oauth_state_cookie_ttl_expiry_state_ttl, _wiki_pages_concepts_patch_merge_clear_requires_explicit_empty_merge_clear, _wiki_pages_concepts_revive_cancelled_event_on_id_reuse_revive_tombstone, _wiki_pages_concepts_soft_delete_skips_cascade_cleanup_skips_cascade [INFERRED 0.75]
- **Neon serverless Postgres operational lessons (pooling, migrations, scale-to-zero cost)** — _wiki_pages_concepts_neon_pooled_vs_direct_url_pooled_vs_direct, _wiki_pages_concepts_migrations_not_auto_applied_vercel_drift, _wiki_pages_concepts_scale_to_zero_defeated_by_db_health_pings_health_pings [INFERRED 0.75]
- **Frontend UI gotchas only caught by real browser (Chrome MCP) verification** — _wiki_pages_concepts_rhf_radix_gotcha_rhf_radix, _wiki_pages_concepts_phone_mask_roundtrip_country_code_phone_mask, _wiki_pages_concepts_scrollbar_gutter_stable_gutter_stable [INFERRED 0.65]
- **Monetization v2 sprint rollout (sessions + synthesis)** — _wiki_pages_synthesis_monetization_v2_state_monetization_v2, _wiki_raw_sessions_2026_05_07_sprint_1_3_monetizacao_session_sprint_1_3, _wiki_raw_sessions_2026_05_07_sprint_4_5_monetizacao_session_sprint_4_5, _wiki_raw_sessions_2026_06_10_sprint6_and_golive_session_sprint6_golive, _wiki_raw_sessions_2026_06_12_golive_completo_e_validacao_pagamento_session_golive_pagamento, _wiki_raw_sessions_2026_06_14_migration_incident_sprint10_session_migration_incident [EXTRACTED 0.75]
- **Google Calendar phased delivery governed by event firewall** — _wiki_pages_synthesis_google_calendar_integration_state_google_calendar_integration, _wiki_pages_concepts_external_event_firewall_external_event_firewall, _context_features_google_calendar_google_calendar [INFERRED 0.75]
- **Go-live bugs surfaced only by real traffic** — _wiki_raw_sessions_2026_06_12_golive_completo_e_validacao_pagamento_session_golive_pagamento, _wiki_pages_concepts_whatsapp_ninth_digit_jid_whatsapp_ninth_digit_jid, _wiki_pages_concepts_asaas_external_reference_in_payment_asaas_external_reference_in_payment [EXTRACTED 0.75]
- **Google Calendar integration (phases A/B/C: overlay, promotion, mirror)** — _wiki_raw_sessions_2026_07_05_google_calendar_integration_fase_a_google_calendar_integration, _wiki_raw_sessions_2026_07_05_google_calendar_integration_fase_a_external_event_firewall, _wiki_raw_sessions_2026_07_10_1447_gcal_phase_b_promotion_external_event_model, _wiki_raw_sessions_2026_07_10_1900_gcal_phase_c_mirror_appointment_mirror_to_google [INFERRED 0.85]
- **Paonetone UI/UX feedback fixes (CSS + editor concepts)** — _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_autofill_highlight_css, _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_tailwind_v4_button_cursor, _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_tiptap_flushsync_domnodeview, _wiki_raw_sessions_2026_06_27_paonetone_ui_feedback_next_themes_default_theme [INFERRED 0.75]
- **ConfirmaAí core data model (User/Patient/Appointment/MessageLog/Settings)** — architecture_user_model, architecture_patient_model, architecture_appointment_model, architecture_messagelog_model, architecture_settings_model [INFERRED 0.85]
- **Jornada do sistema: conta → configurar → WhatsApp → agenda → confirmação automática → no-show → dashboard** — fluxogramas_acessa_confirmaai, fluxogramas_cria_a_conta, fluxogramas_cria_conta_anti_fraude, fluxogramas_faz_login, fluxogramas_configura_a_clinica, fluxogramas_conecta_o_whatsapp, fluxogramas_cadastra_pacientes, fluxogramas_cria_agendamento, fluxogramas_cron_30_min, fluxogramas_envia_confirmacao_t24h, fluxogramas_recebe_no_whatsapp, fluxogramas_atualiza_status, fluxogramas_dashboard_atualiza, fluxogramas_acompanha_reduz_faltas [EXTRACTED 1.00]
- **Fluxo de dev com agentes: ler .context → plano → schema/contrato → backend → frontend → definição de feito + Chrome MCP → deploy → curadoria → commit** — fluxogramas_descreve_a_tarefa, fluxogramas_le_context_readme, fluxogramas_monta_plano_specs, fluxogramas_prisma_schema_migration, fluxogramas_congela_contrato_api, fluxogramas_backend_route_handlers, fluxogramas_frontend_ux, fluxogramas_definicao_de_feito, fluxogramas_passou_no_chrome, fluxogramas_deploy_na_vercel, fluxogramas_curadoria_conhecimento, fluxogramas_comita_via_gh [EXTRACTED 1.00]
- **Estratégia de monetização: níveis de assinatura, limite de 5 pacientes únicos, bloqueio/paywall e cobrança** — monetizacao_prompt_niveis_de_assinatura, monetizacao_prompt_plano_free, monetizacao_prompt_plano_pago, monetizacao_prompt_limite_5_pacientes_unicos, monetizacao_prompt_fluxo_de_bloqueio, monetizacao_prompt_cobranca_pix_cartao [EXTRACTED 1.00]
- **Generic Next.js starter-template boilerplate icons (low value)** — public_file_starter_icon, public_globe_starter_icon, public_next_starter_icon, public_vercel_starter_icon, public_window_starter_icon [INFERRED 0.85]

## Communities (172 total, 68 thin omitted)

### Community 0 - "Seed & Backfill Scripts"
Cohesion: 0.08
Nodes (34): GET(), PhoneInput, PhoneInputProps, brPhoneCandidates(), digitsOnly(), formatPhoneDisplay(), getLocalDigits(), isValidPhone() (+26 more)

### Community 1 - "Patient & Usage UI Components"
Cohesion: 0.05
Nodes (53): LEVEL_STYLES, MessageUsagePill(), Patient, PatientComboboxProps, AlertDialogOverlay(), Avatar(), AvatarBadge(), AvatarFallback() (+45 more)

### Community 2 - "Feature Registry (.context)"
Cohesion: 0.07
Nodes (68): Feature: audit, Feature: auth, Feature: billing, Feature: dashboard, Feature: google-calendar, Feature: observability, Feature: plan-quota, Feature: scheduler (+60 more)

### Community 3 - "Agenda & Appointment Form"
Cohesion: 0.07
Nodes (58): AccountsSection(), AgendaPage(), AppointmentForm, appointmentSchema, canPromoteGoogleEvent(), DURATION_OPTIONS, statusOptions, ConfiguracoesPage() (+50 more)

### Community 4 - "API Routes & Legal Pages"
Cohesion: 0.27
Nodes (6): metadata, metadata, LegalPage(), LegalSection, PRIVACY_SECTIONS, TERMS_SECTIONS

### Community 5 - "BM25 Search Engine (skill)"
Cohesion: 0.06
Nodes (42): BM25, detect_domain(), _load_csv(), Lowercase, split, remove punctuation, filter short words, Build BM25 index from documents, Score all documents against query, Load CSV and return list of dicts, Core search function using BM25 (+34 more)

### Community 6 - "Asaas Billing Provider"
Cohesion: 0.11
Nodes (13): deriveNextDueDate(), mapPaymentStatus(), mapPaymentStatus(), MockProvider, computePixExpiresAt(), _ttlRaw, CheckoutResult, CreateCheckoutInput (+5 more)

### Community 7 - "Checkout & Billing Pages"
Cohesion: 0.15
Nodes (26): formatTemplatePreview(), SettingsForm, settingsSchema, TemplatePreview(), AppHeaderProps, AccountDataCard(), CALLBACK_ERROR_MESSAGES, ResetAccountCard() (+18 more)

### Community 8 - "Auth & Email-Verify Routes"
Cohesion: 0.08
Nodes (45): createVerificationToken(), hashToken(), SendResult, sendVerificationEmail(), verifyEmailToken(), VerifyResult, b64(), makeResetToken() (+37 more)

### Community 9 - "Phone Input & Normalization"
Cohesion: 0.10
Nodes (23): react, react, CheckoutPage(), CheckoutResponse, BillingPage(), CheckoutSuccessPage(), metadata, ExportCsvButton() (+15 more)

### Community 10 - "Claude Agents & Skills"
Cohesion: 0.09
Nodes (43): backend-architect agent, code-reviewer agent, frontend-developer agent, ralph-loop agent, ui-designer agent, ui-ux-pro-max design skill, Template de registro de feature, Reset de conta Free (1x vitalício) (+35 more)

### Community 11 - "CRUD API Routes"
Cohesion: 0.13
Nodes (20): DELETE, PUT, GET(), POST, APP_INCLUDE, convertSchema, patientCollisionResponse(), POST (+12 more)

### Community 12 - "CSV Export Routes (RFC-4180)"
Cohesion: 0.22
Nodes (12): RFC-4180, GET(), STATUS_LABEL, GET(), GET(), paywallResponse(), buildCsv(), csvEscape() (+4 more)

### Community 13 - "Admin Audit Pages"
Cohesion: 0.13
Nodes (24): AdminAuditPage(), fmt(), ACTOR_LABEL, AtividadePage(), PacientesPage(), ExistingPatient, PageHeader(), PageHeaderProps (+16 more)

### Community 14 - "Google OAuth (PKCE)"
Cohesion: 0.05
Nodes (75): RFC-7636, main(), accessTokenIsFresh(), AppointmentEventInput, appOriginEventId(), buildEventResource(), createGoogleEvent(), deleteEventOnce() (+67 more)

### Community 15 - "API Routes (POST)"
Cohesion: 0.13
Nodes (22): DELETE, GET, POST, GET(), POST(), GET, DisconnectResponse, POST (+14 more)

### Community 16 - "Paywall & Export UI"
Cohesion: 0.09
Nodes (29): metadata, Status, KNOWN_REASONS, PaywallModal(), PaywallModalProps, PaywallReason, TITLES, cpfFormSchema (+21 more)

### Community 17 - "System Flow (onboarding→confirm)"
Cohesion: 0.08
Nodes (29): Acessa o ConfirmaAí, Acompanha e reduz faltas (upgrade PRO R$97/mês), Atualiza status (1 → CONFIRMED · 2 → CANCELED via webhook + confirmedAt), Cadastra pacientes (FREE = 5 vagas vitalícias), Conecta o WhatsApp (QR Evolution, 1 instância por conta → CONNECTED), Configura a clínica (valor médio · antecedência 24h/6h · templates), Cria a conta (nome, e-mail, senha, clínica, CPF), Cria agendamento (valida conflito + data futura → PENDING) (+21 more)

### Community 18 - "TypeScript Config Globs"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 19 - "Scheduler & Billing Maintenance"
Cohesion: 0.20
Nodes (14): appBaseUrl(), autoCancelUnconfirmed(), CONFIRMATION, effectiveDeadlineMs(), startScheduler(), logQuotaBlockedOnce(), markNoShows(), processSends() (+6 more)

### Community 20 - "API Routes (POST bodies)"
Cohesion: 0.26
Nodes (13): RegisterPage(), canonicalizeCnpj(), checkDigit(), CNPJ_W1, CNPJ_W2, CnpjValidationResult, formatCnpj(), SEQUENTIAL_CNPJS (+5 more)

### Community 21 - "Login & Auth Pages"
Cohesion: 0.14
Nodes (13): Form, schema, LoginForm, loginSchema, Form, schema, RegisterForm, registerSchema (+5 more)

### Community 22 - "Google Calendar Read API"
Cohesion: 0.16
Nodes (18): POST, POST, POST, AuditContext, getAuditContext(), getOrSystemContext(), requireAuditContext(), runWithAuditContext() (+10 more)

### Community 23 - "Google Calendar Write API"
Cohesion: 0.24
Nodes (8): DELETE, PUT, POST, TimeBlockResponse, CreateTimeBlockInput, createTimeBlockSchema, UpdateTimeBlockInput, updateTimeBlockSchema

### Community 24 - "Ops Scripts (gcal/beta)"
Cohesion: 0.08
Nodes (18): main(), main(), bodySchema, POST, bodySchema, CheckoutResponse, POST, POST (+10 more)

### Community 25 - "Dashboard & Layout"
Cohesion: 0.15
Nodes (11): computeWeeklyTrend(), DashboardPage(), LogoMark(), AppSidebarProps, navigation, ThemeToggle(), LegalDialog(), Tooltip() (+3 more)

### Community 26 - "shadcn/ui Config"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 27 - "React UI Components"
Cohesion: 0.05
Nodes (35): ⚠️ Armadilha: `pending` (anti-flicker) precisa de sinal EXPLÍCITO para sair, Arquivos, Arraste entre dias no modo Mês (`month-view.tsx`), Callbacks (fornecidos pelo `agenda/page.tsx`), Card BAIXO vira 1 linha (2026-07-24), Clique num evento do Google (nas duas grades), Como estender, Feature: Arraste na agenda (grade de horas do Dia + Mês entre dias) (+27 more)

### Community 28 - "Admin Layout & Routes"
Cohesion: 0.11
Nodes (36): AdminLayout(), AdminAccount, GET(), AUDIT_SELECT, GET(), bodySchema, POST(), GET() (+28 more)

### Community 29 - "Playwright E2E Specs"
Cohesion: 0.19
Nodes (11): TIMES, last9, PATIENT, PATIENT_UPDATED, tomorrow, displayPhone(), expectTime(), fillPhoneInput() (+3 more)

### Community 30 - "Test Runner (test:sprints)"
Cohesion: 0.18
Nodes (13): check(), generateValidCpf(), main(), results, Sprint, isPatientPurgeDue(), resetBlockMessage(), resetEligibility (+5 more)

### Community 31 - "Dev-with-Agents Workflow"
Cohesion: 0.15
Nodes (17): Aprova deploy + migration? (checkpoint humano), Aprova o plano? (checkpoint humano), Aprova schema + contratos? (checkpoint humano), Backend: route handlers (src/app/api · Zod · filtro por userId · await params), Code review passou? (sem vazamento entre tenants · inputs validados · sem N+1), Você comita via gh (os agentes não commitam), Congela o contrato de API ({ data } + Zod), Curadoria de conhecimento (wiki-ingest + atualiza .context) (+9 more)

### Community 32 - "Architecture Core (stack)"
Cohesion: 0.17
Nodes (16): WhatsApp reply FIFO match and ack, Automatic confirmation flow (24h send, webhook reply, no-show), ConfirmaAí Architecture (Next.js monolith + Prisma + Evolution), Evolution API (WhatsApp integration), Prisma ORM, Scheduler (node-cron every 30 min), Real stack (Next.js 16 monolith, Prisma v7, node-cron, NextAuth v4), Scheduler + WhatsApp integration task (+8 more)

### Community 33 - "npm Scripts (package.json)"
Cohesion: 0.12
Nodes (16): scripts, build, db:generate, db:migrate, db:migrate:deploy, db:seed, db:studio, dev (+8 more)

### Community 34 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): eslint-config-next, jsdom, devDependencies, eslint-config-next, jsdom, @testing-library/react, ts-node, @types/pg (+7 more)

### Community 35 - "Settings Page & Form"
Cohesion: 0.17
Nodes (18): Action, Allow, checkStatus(), Decision, Deny, DenyReason, effectivePlanTier(), getPlanConfig() (+10 more)

### Community 36 - "Dashboard Shell & Guards"
Cohesion: 0.11
Nodes (16): DashboardLayout(), AppHeader(), AppSidebar(), SessionGuard(), OnboardingWizard(), Sheet(), SheetContent(), SheetDescription() (+8 more)

### Community 37 - "Patients & Quota Feature"
Cohesion: 0.19
Nodes (14): Pacientes (Patients CRUD feature), PhoneInput canonical↔display round-trip, PatientQuotaSlot, Plan Quota (lifetime patient slots), Ralph Agent Build Instructions, Ralph Fix Plan (E2E fixes & bug resolution), Ralph Development Instructions, Patient creation bug (empty-string email / duplicate phone 500) (+6 more)

### Community 38 - "Audit & Billing Models"
Cohesion: 0.18
Nodes (13): Audit context (AsyncLocalStorage), Audit Prisma extension, AuditLog, BillingEvent (idempotency), Billing + Audit Roadmap (v1, messages/month), Subscription model, UsageCounter, Go-to-Market checklist (+5 more)

### Community 39 - "Evolution Webhook Parser"
Cohesion: 0.22
Nodes (6): EvolutionEvent, POST, findPendingAppointmentForResponse(), CANCEL_KEYWORDS, CONFIRM_KEYWORDS, parseResponse()

### Community 40 - "Confirmation Link Page"
Cohesion: 0.22
Nodes (8): ConfirmarPage(), metadata, ConfirmActions(), Result, formatAppointmentDate(), formatAppointmentTime(), buildConfirmationAck(), SAT_2330

### Community 41 - "External Event Firewall"
Cohesion: 0.21
Nodes (12): External event firewall (Google events never enter Appointment), Double-booking race outside tx (Serializable ≠ conflict protection), ExternalEvent model (lazy on promotion, 1:1 Appointment), Promotion idempotency under race (check already-promoted before conflict), Manual promotion event→appointment (match patientId→phone→CPF), Sessão 2026-07-10-1447 — GCal Fase B (promoção manual), Stale async response guard (ref-mirror survives UI context switch), Tautological regression test (grep call ≠ grep predicate) (+4 more)

### Community 42 - "Confirmation Token (HMAC)"
Cohesion: 0.30
Nodes (9): bodySchema, POST(), b64(), ConfirmationVerify, makeConfirmationToken(), secret(), sign(), unb64() (+1 more)

### Community 43 - "Template Editor (TipTap)"
Cohesion: 0.20
Nodes (10): InlineJSON, lineToInline(), parse(), TemplateEditor, TemplateEditorHandle, TemplateEditorProps, TemplateVar, VAR_ALTERNATION (+2 more)

### Community 44 - "Audit Prisma Extension"
Cohesion: 0.21
Nodes (9): ACTION_BY_OP, AUDITED_MODELS, auditExtension, camelize(), ModelDelegate, readOne(), redact(), redactArgs() (+1 more)

### Community 45 - "GET API Routes"
Cohesion: 0.31
Nodes (6): GET(), GET, buildAccountExport(), actionLabel(), knownActions(), LABELS

### Community 46 - "API Routes (GET/POST)"
Cohesion: 0.19
Nodes (10): appointmentStatusValues, CreateAppointmentInput, createAppointmentSchema, UpdateAppointmentInput, updateAppointmentSchema, cpfSchema, CreatePatientInput, UpdatePatientInput (+2 more)

### Community 47 - "Form Components (shadcn)"
Cohesion: 0.25
Nodes (9): FormControl(), FormDescription(), FormFieldContext, FormFieldContextValue, FormItemContext, FormItemContextValue, FormLabel(), FormMessage() (+1 more)

### Community 48 - "Core Data Models"
Cohesion: 0.20
Nodes (10): GoogleCalendarConnection model (1:1 User, encrypted tokens), Settings model (por usuário), User model (dono da clínica), Business model (R$97/mês por estabelecimento; anti-faltas SaaS), .context/README.md orchestrator (operational source of truth), Multi-tenancy by userId (each User is a tenant, no tenant_id), CLAUDE.md — ConfirmaAí project instructions, API routes task (auth, patients, appointments, dashboard, settings) (+2 more)

### Community 49 - "WhatsApp Webhook Matching"
Cohesion: 0.31
Nodes (10): brPhoneCandidates (nono dígito fix), findPendingAppointmentForResponse (FIFO match), Webhook Evolution, WhatsApp connection feature, Appointment.status state machine, Confirmação Automática E2E flow, Multi-tenancy isolation flow, getAuthSession (+2 more)

### Community 50 - "Token Crypto & GCal Scripts"
Cohesion: 0.25
Nodes (7): A regra, Cheiro geral (fora deste projeto), Cross-refs, Fontes, Grave a intenção, não deduza do relógio, O caso concreto, Por que não uma tabela separada

### Community 51 - "Root Layout & Fonts"
Cohesion: 0.24
Nodes (6): geistMono, metadata, plusJakarta, Providers(), Toaster(), TooltipProvider()

### Community 52 - "Billing Notifications (Dunning)"
Cohesion: 0.51
Nodes (9): allIdentifiers(), canonicalizePhone(), getPepper(), hashCnpj(), hashCpf(), hashDocument(), hashPhone(), primaryIdentifier() (+1 more)

### Community 53 - "Message Template Assembly"
Cohesion: 0.31
Nodes (7): formatMessage(), MessageData, stripResponseInstruction(), withConfirmationLink(), withResponseInstruction(), messageBody(), UpdateSettingsInput

### Community 54 - "Agenda Mini-calendar"
Cohesion: 0.22
Nodes (9): Agenda mini-calendar (6-week fixed grid, day dots), NextAuth getServerSession no-op res discards jwt cookie, Sessão 2026-07-04 — Mini-calendário na agenda + revalidação de sessão, Agenda Month view (6-week grid, shared getMonthGridRange), Chrome MCP native setter for select/time inputs + fetch intercept, Edit form clobbers concurrent field (only send status when changed), Radix popover/dialog first click swallowed (pointer-events teardown), Sessão 2026-07-10 — Agenda visão de Mês + ações unificadas (+1 more)

### Community 55 - "GCal OAuth Security"
Cohesion: 0.25
Nodes (9): Google Calendar integration (feature, phases A/B/C), Google event overlay (read-only) on agenda, OAuth state HMAC bound to userId (fixes cross-tenant), Revoking one refresh token drops entire account+app grant, Sessão 2026-07-05 (noite) — GCal Fase A completa (OAuth+UI+overlay), OAuth scope check before persist (no half-connected state), OAuth state/PKCE cookie TTL expiry (slow consent → gcal_error=state), Sessão 2026-07-10 — GCal validação E2E real + go-live dark (+1 more)

### Community 56 - "Runtime Dependencies (bcrypt/pg)"
Cohesion: 0.22
Nodes (9): bcryptjs, dependencies, bcryptjs, pg, @tiptap/extension-placeholder, zod, pg, @tiptap/extension-placeholder (+1 more)

### Community 57 - "WhatsApp Resilience"
Cohesion: 0.28
Nodes (9): runWhatsappResilience, WhatsappDisconnectedBanner, Evolution API client (evolution.ts), WhatsApp resilience (whatsapp-alerts.ts), DIRECT_URL vs pooled DATABASE_URL (Neon), Hetzner VPS Evolution stack, Resend email service, Deployment Status snapshot (+1 more)

### Community 59 - "Email-Verify & Login Gate"
Cohesion: 0.29
Nodes (8): Email normalization trim+lowercase (collision-safe migration), Horizontal scroll from offscreen elements, Block login until email verified (EmailNotVerifiedError), NextAuth credentials authorize stub, Rate-limit via audit (per account-target dimension), Sessão 2026-06-24 — Bugfix cadastro/login (4 bugs), scrollbar-gutter: stable (fixes horizontal jitter), Mobile S24+ overflow/tilt fixes + TimeSelect (resize_window no-op)

### Community 60 - "CSS/Theme Gotchas"
Cohesion: 0.29
Nodes (8): Autofill highlight CSS (:-webkit-autofill box-shadow inset), next dev serves stale CSS after build (clean .next), next-themes default theme (light default, resolvedTheme), Sessão 2026-06-27 — Paonetone UI/UX feedback (8 itens), Tailwind v4 button cursor (Preflight zeroes button cursor), Template editor chips (TipTap v3, serializes to {var}), TipTap flushSync / DOM node view (template chips editor), UI anti-patterns (no emojis as icons, cursor:pointer, no horizontal scroll)

### Community 61 - "Plan Entitlements & Quota Gate"
Cohesion: 0.25
Nodes (8): CPF obrigatório no plano Free, entitlements.check, PLANS config (plans.ts), Message quota gate (usage.ts), sendConfirmations, buildConfirmationAck, sendWhatsAppMessage wrapper, Paywall / UsageBadge UI

### Community 62 - "Settings & Auto-cancel"
Cohesion: 0.25
Nodes (8): autoCancelUnconfirmed (ex-sendReminders), Configurações (Settings feature), Currency mask input (avgAppointmentValue), RESPONSE_INSTRUCTION fixed system block, TipTap chips template editor, UnsavedChangesGuard, parseResponse / CONFIRM_KEYWORDS / CANCEL_KEYWORDS, Confirmação por Link (link-based confirmation)

### Community 63 - "Currency Mask Input"
Cohesion: 0.43
Nodes (5): CurrencyInput, CurrencyInputProps, centsToDisplay(), rawToCents(), valueToCents()

### Community 64 - "GCal Phase A (OAuth design)"
Cohesion: 0.29
Nodes (7): Dev fallback without secrets (gate reversible secret to test runner), Migrations not auto-applied (prisma migrate dev did not regenerate client), OAuth separate flow (auth-code + PKCE, not NextAuth GoogleProvider), Sessão 2026-07-05 — Google Calendar Fase A (design + backend), Soft-delete skips cascade cleanup (needs explicit teardown), token-crypto.ts AES-256-GCM token encryption, NextAuth (credentials provider, JWT)

### Community 65 - "Brand Identity & Palette"
Cohesion: 0.33
Nodes (7): Google OAuth verification for sensitive scope (privacy policy, CPF ok, no CNPJ), Brand: Clínica Organizada (Agenda Viva logo), Brand palette (cyan + health green #10b981), Brand typography (Plus Jakarta Sans + Geist Mono), Design system color palette (cyan + health green), ConfirmaAí Design System Master, Glassmorphism style guideline

### Community 66 - "Scheduler Cron Cadence"
Cohesion: 0.29
Nodes (7): Cron cadence prod vs dev (vercel.json vs node-cron), markNoShows, runSchedulerJobs, Scheduler / Cron Jobs, Timezone handling (America/Sao_Paulo formatInTimeZone), Scheduler initialization fix (instrumentation.ts), Security Fixes Spec

### Community 67 - "Agenda Page (snapshot)"
Cohesion: 0.38
Nodes (7): Page actions (Exportar CSV, Novo Agendamento) and Pro plan badge, Agenda page (weekly appointment management view), Empty-state 'Nenhum agendamento nesta semana' (likely failure cause: no seeded appointments shown), Agenda filters (Todos os status, Todos os pacientes), Playwright failure screenshot: Agenda 'should display seeded appointments', Sidebar navigation (Dashboard, Agenda, Pacientes, Plano, Configurações), Week navigation controls (21 jun - 27 jun 2026, Anterior/Hoje/Próxima)

### Community 68 - "Neon Scale-to-Zero & Health"
Cohesion: 0.40
Nodes (6): Claude-in-Chrome is per-profile extension, GET /api/health/live liveness endpoint (no DB touch), Neon Postgres (prod DB, managed via Vercel, Free 100 CU-hrs), Scale-to-zero defeated by DB health pings, Sessão 2026-06-26 — Corte de custo Neon (scale-to-zero), PostgreSQL

### Community 69 - "GCal Anti-Loop & Write Scope"
Cohesion: 0.33
Nodes (6): Anti-loop both directions (confirmaaiOrigin=app tag + de-dup), OAuth calendar.events write scope (hasWriteScope vs hasCalendarScope), Deterministic event id (appOriginEventId = base32hex sha256, idempotent insert), events.patch merge — clear requires explicit empty (description:""), Revive cancelled event on id reuse (patch status:confirmed), Sessão 2026-07-10-1900 — GCal Fase C (espelhar Appointment→Google)

### Community 70 - "Confirmation Link Deadline Rules"
Cohesion: 0.53
Nodes (6): Baked deadline needs grace floor (sentAt+GRACE avoids born-expired link), BusinessType enum (HEALTH/AESTHETICS/BEAUTY/FINANCE/OTHER), Confirmação por link (HMAC stateless token, page GET + POST, auto-cancel), Link action must not mutate on GET (WhatsApp prefetch anti-pattern), Onboarding + terminology (wizard, Paciente vs Cliente by ramo), Sessão 2026-07-19 — Confirmação por link + Onboarding + fixes mobile

### Community 71 - "Claude Code Hooks"
Cohesion: 0.33
Nodes (5): hooks, SessionEnd, SessionStart, UserPromptSubmit, $schema

### Community 72 - "Identifier Hashing & reCAPTCHA"
Cohesion: 0.33
Nodes (6): CPF_HASH_PEPPER, Identifier hashing/canonicalization (identifiers.ts), reserveSlotInTx (Serializable reservation), reCAPTCHA v3, CPF validator (cpf-validator.ts), SignupAttempt / anti-fraude signup

### Community 73 - "package.json Metadata"
Cohesion: 0.33
Nodes (5): name, prisma, seed, private, version

### Community 74 - "Time Select Component"
Cohesion: 0.06
Nodes (37): DayGrid(), DayGridProps, DragState, fmtMinLabel(), googleDurationMin(), GridAppointment, GridBlock, GridGoogleEvent (+29 more)

### Community 75 - "NextAuth Types"
Cohesion: 0.33
Nodes (5): JWT, next-auth, next-auth/jwt, Session, User

### Community 76 - "Wiki Operations"
Cohesion: 0.33
Nodes (6): Wiki page template / frontmatter, Wiki INGEST operation, Wiki LINT operation, Wiki Operational Manual (AGENTS), Wiki QUERY operation, Wiki Overview (README)

### Community 77 - "NextAuth Gotchas"
Cohesion: 0.40
Nodes (5): NextAuth v4 CredentialsProvider - authorize fica em .options.authorize, NextAuth v4 - getServerSession descarta escrita de cookie do callback jwt, Rate limit via AuditLog (sem Redis), Teste de regressao deve asserir o predicado, nao a chamada, Guard de resposta assincrona obsoleta (ref-espelho do contexto ativo)

### Community 78 - "OAuth & Quota Rationale"
Cohesion: 0.40
Nodes (5): Validar escopo concedido ANTES de gravar a conexao (sem meio conectado), TTL curto do cookie de state/PKCE derruba consent lento, Documento do dono - alargar de CPF para CPF-ou-CNPJ sem quebrar o anti-fraude, Quota ledger com slot vitalicio, Soft-delete nao dispara onDelete:Cascade - credenciais externas ficam orfas

### Community 79 - "Dev Tunnel Script"
Cohesion: 0.50
Nodes (3): asaas(), cleanup(), dev-tunnel.sh script

### Community 80 - "Agenda Failure Screenshot"
Cohesion: 0.50
Nodes (5): ConfirmaAí Agenda page (Gerencie seus agendamentos) with Exportar CSV and Novo Agendamento actions, Empty state: 'Nenhum agendamento nesta semana' for week 21 jun - 27 jun 2026 (no seeded appointments shown), Playwright failure screenshot: Agenda should display seeded appointments (chromium retry1), Sidebar nav (Clínica Organizada): Dashboard, Agenda active, Pacientes, Plano, Configurações, Week navigation and filters: Anterior/Hoje/Próxima, Todos os status, Todos os pacientes

### Community 81 - "Deploy/Migration Gotchas"
Cohesion: 0.50
Nodes (4): Vercel nao aplica migrations no deploy (drift silencioso), Neon - URL pooled (runtime) vs direta (migrations), Dependencia opcional via import dinamico gated por env, Health check com DB + uptime monitor frequente derruba o scale-to-zero

### Community 82 - "Agenda Day/Week & Phone Fix"
Cohesion: 0.50
Nodes (4): Agenda Dia/Semana toggle, Phone mask roundtrip country code bug, Sessão 2026-06-27-2252 — Paonetone round 2 + fix telefone, Webhook idempotency via unique constraint (dedup message-id, open)

### Community 83 - "Prisma Client & Login Diagnose"
Cohesion: 0.50
Nodes (3): @prisma/client, @prisma/client, main()

### Community 84 - "Dashboard Metrics Test"
Cohesion: 0.50
Nodes (3): AppointmentStatus, AppointmentStatusType, MockAppointment

### Community 85 - "Beta Override Entitlement"
Cohesion: 1.00
Nodes (3): effectivePlanTier() — override active → PREMIUM at 4 gates, Entitlement override decoupled from billing, Sessão 2026-06-26 — Flag de beta tester (premium cortesia)

### Community 86 - "CPF/CNPJ Owner Document"
Cohesion: 1.00
Nodes (3): Identifier hash namespacing (cpf:/cnpj: dispatch preserves compat), Owner document accepts CPF or CNPJ (single auto-detect field), Sessão 2026-06-26 — Documento do dono CPF ou CNPJ

### Community 93 - "class-variance-authority"
Cohesion: 0.09
Nodes (23): bodySchema, POST, bodySchema, POST, POST, ConnectResponse, POST, POST() (+15 more)

### Community 100 - "eslint-config-next"
Cohesion: 0.50
Nodes (3): FUTURE, NOW, PAST

### Community 126 - "testing-library/jest-dom"
Cohesion: 0.12
Nodes (15): A regra, Arraste ou toque? Pergunte ao valor, não ao pixel, Contexto, Cross-refs, Fontes, O custo do clique-fantasma depende do que o clique faz (2026-07-24), O resto do kit de Pointer Events, Quando NÃO se aplica (+7 more)

### Community 157 - "usage.ts"
Cohesion: 0.24
Nodes (10): main(), calendarMonthPeriod(), currentPeriodFor(), getCurrentUsage(), getOrCreateCounter(), hasMessageQuota(), incrementMessagesSent(), MessageUsage (+2 more)

### Community 160 - "evolution.ts"
Cohesion: 0.52
Nodes (5): canonicalizeCpf(), CpfValidationResult, formatCpf(), SEQUENTIAL_CPFS, validateCpf()

### Community 162 - "email-verification.ts"
Cohesion: 0.60
Nodes (3): validateDocument(), CheckoutCpfResult, resolveCheckoutCpf()

### Community 165 - "lib/auth.ts"
Cohesion: 0.16
Nodes (11): handler, authOptions, EmailNotVerifiedError, extractIp(), readHeader(), LoginInput, loginSchema, RegisterInput (+3 more)

### Community 167 - "Mover entre dias: componentes locais, não aritmética de timestamp"
Cohesion: 0.25
Nodes (7): A regra, Contexto, Cross-refs, Fontes, Mover entre dias: componentes locais, não aritmética de timestamp, Pontos-chave, Quando NÃO se aplica

### Community 168 - "disposable-emails.ts"
Cohesion: 0.70
Nodes (3): DISPOSABLE_DOMAINS, disposableDomainCount(), isDisposableEmail()

### Community 169 - "ux-writer.md"
Cohesion: 0.50
Nodes (3): Como você trabalha, Exemplos do padrão (antes → depois), Princípios de escrita (nesta ordem)

### Community 170 - "seed.ts"
Cohesion: 0.50
Nodes (3): adapter, main(), prisma

### Community 171 - "recaptcha.ts"
Cohesion: 0.29
Nodes (7): POST, RecaptchaResult, verifyRecaptchaToken(), checkSignupRateLimit(), hashEmail(), RateLimitResult, trackSignupAttempt()

## Knowledge Gaps
- **556 isolated node(s):** `$schema`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `session-checkpoint.sh script` (+551 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **68 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Runtime Dependencies (bcrypt/pg)` to `Phone Input & Normalization`, `day-grid.tsx`, `package.json Metadata`, `Prisma Client & Login Diagnose`, `auth/prisma-adapter`, `clsx`, `cmdk`, `date-fns`, `date-fns-tz`, `hookform/resolvers`, `lucide-react`, `next`, `next-auth`, `next-themes`, `node-cron`, `prisma`, `prisma/adapter-pg`, `radix-ui`, `react-dom`, `react-hook-form`, `recharts`, `sentry/nextjs`, `sonner`, `tailwind-merge`, `tanstack/react-query`, `tiptap/pm`, `tiptap/react`, `tiptap/starter-kit`, `zustand`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `react` connect `Phone Input & Normalization` to `Agenda & Appointment Form`, `Checkout & Billing Pages`, `Admin Audit Pages`, `Form Components (shadcn)`, `Runtime Dependencies (bcrypt/pg)`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `cn()` connect `Patient & Usage UI Components` to `Seed & Backfill Scripts`, `Dashboard Shell & Guards`, `Checkout & Billing Pages`, `Phone Input & Normalization`, `Time Select Component`, `Template Editor (TipTap)`, `Admin Audit Pages`, `Form Components (shadcn)`, `Paywall & Export UI`, `Login & Auth Pages`, `Dashboard & Layout`, `Currency Mask Input`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `$schema`, `UserPromptSubmit`, `SessionStart` to the rest of the system?**
  _556 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Seed & Backfill Scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.08048103607770583 - nodes in this community are weakly interconnected._
- **Should `Patient & Usage UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.050078247261345854 - nodes in this community are weakly interconnected._
- **Should `Feature Registry (.context)` be split into smaller, more focused modules?**
  _Cohesion score 0.06628621597892889 - nodes in this community are weakly interconnected._
## Notas manuais (não geradas pelo graphify)

- **2026-07-24 — poda manual de 1 nó semântico stale**: `context_features_appointments_conflict_detection`
  (`findConflictingAppointment (overlap [start,end))`, vindo de `.context/features/appointments.md`)
  apontava para função e arquivo **deletados** naquele dia (sobreposição de horário passou a ser
  permitida). `graphify update` só re-extrai a camada de **código** — nós de doc/conceito sobrevivem
  até um rebuild completo com LLM, então o nó e sua aresta `implements` foram removidos à mão de
  `graph.json`, de `graph.html` (dados embutidos) e as contagens deste relatório ajustadas.
  Backup do estado anterior no scratchpad da sessão. 1962→**1961** nós, 4506→**4505** arestas.
