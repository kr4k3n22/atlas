# ATLAS — AI Transparency Layer for Accountable Systems

**Live:** [cyber295atlas.app](https://cyber295atlas.app)

ATLAS is a **Human-in-the-Loop (HITL) governance framework** for AI-assisted welfare benefit decisions. It intercepts AI tool calls via an MCP (Model Context Protocol) gateway, risk-scores them against NIST AI RMF policies, and routes high-risk actions to human approvers before execution. The system provides a citizen-facing chat portal and an approver dashboard with real-time case management, audit logging, and SLA enforcement.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [User Roles](#user-roles)
- [How It Works](#how-it-works)
- [Related Repositories](#related-repositories)
- [Roadmap](#roadmap)

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Citizen Chat    │────▶│  ATLAS Next.js App    │────▶│  MCP Gateway        │
│  (/chat)         │     │                      │     │  (Atlas-MCP-Gateway) │
└─────────────────┘     │  ┌──────────────────┐ │     └──────────┬──────────┘
                        │  │ Policy Engine     │ │                │
                        │  │ (NIST AI RMF)    │ │     ┌──────────▼──────────┐
                        │  └──────────────────┘ │     │  Modal SLM          │
                        │                      │     │  (Risk Inference)    │
┌─────────────────┐     │  ┌──────────────────┐ │     └─────────────────────┘
│  Approver Portal │────▶│  │ Case Store       │ │
│  (/cases)        │     │  │ (Supabase)       │ │     ┌─────────────────────┐
└─────────────────┘     │  └──────────────────┘ │     │  Inngest             │
                        │                      │     │  (Durable Workflows) │
                        │  ┌──────────────────┐ │     └─────────────────────┘
                        │  │ Audit Store      │ │
                        │  │ Action Executor  │ │
                        │  └──────────────────┘ │
                        └──────────────────────┘
                                   │
                          ┌────────▼────────┐
                          │   Supabase      │
                          │   (PostgreSQL)  │
                          │   + Realtime    │
                          └─────────────────┘
```

---

## Key Features

### Citizen Chat Portal (`/chat`)
- Conversational UI for welfare benefit queries (unemployment, claims, appeals)
- Persistent chat history with conversation management (create, search, delete)
- Automatic escalation of high-risk actions (claim submissions, record modifications)
- Real-time notifications via Supabase Realtime when an approver responds
- Quick-prompt buttons for common queries

### Approver Dashboard (`/cases`)
- Real-time case queue with live Supabase Realtime subscriptions + polling fallback
- Risk triage: ROUTINE / ESCALATE / BLOCK labels with color-coded badges
- Article 14 (Human Rights Act) risk detection and filtering
- Harm/rights signal level indicators (none → strong)
- Recommended action badges (auto-approve, escalate, refer fraud, freeze payment)
- Three-action decisions: Approve, Reject, Request Info
- Mandatory decision notes with approver identity tracking
- SLA monitoring with case age tracking and 24-hour wait alerts
- Audio notification chimes (urgent double-beep for BLOCK, single for ESCALATE)
- Keyboard shortcuts (J/K navigate, A/R/I for approve/reject/request info)
- Configurable settings (theme, inbox defaults, notification preferences)

### Governance & Compliance
- **NIST AI RMF Policy Engine** — Rule-based evaluation of welfare decisions against configurable policy rules
- **Full audit trail** — Every case creation, decision, and action logged to `audit_log` table
- **Gateway integration** — Bidirectional communication with Atlas-MCP-Gateway via Inngest events
- **Action execution** — Approved actions are executed and logged in `action_executions` table
- **SLA enforcement** — Stale cases auto-expire; approaching-SLA cases surfaced to reviewers

### Authentication
- Supabase Auth with cookie-based session persistence
- Separate login flows for citizens (`/login`) and approvers (`/approver/login`)
- Role-based access: approver accounts validated via `user_metadata.role`
- Password reset and registration flows

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router) |
| Language | TypeScript 5.9 |
| UI | [Tailwind CSS 4](https://tailwindcss.com), [Radix UI](https://www.radix-ui.com/), [shadcn/ui](https://ui.shadcn.com/) |
| Database | [Supabase](https://supabase.com) (PostgreSQL + Realtime) |
| Auth | Supabase Auth |
| Validation | [Zod 4](https://zod.dev/) |
| Icons | [Lucide React](https://lucide.dev/) |
| Toasts | [Sonner](https://sonner.emilkowal.dev/) |
| MCP Gateway | [Atlas-MCP-Gateway](https://github.com/aidant64/Atlas-MCP-Gateway) (Python/FastMCP) |
| Workflows | [Inngest](https://www.inngest.com/) (durable governance workflows) |
| Risk Inference | [Modal](https://modal.com/) (SLM inference) |
| Deployment | [Vercel](https://vercel.com) |

---

## Project Structure

```
src/
├── app/
│   ├── _components/          # Shared app components (ThemeInit, etc.)
│   ├── api/
│   │   ├── actions/execute/  # POST — execute approved actions
│   │   ├── audit/            # GET — audit log
│   │   ├── auth/             # me, logout endpoints
│   │   ├── cases/            # GET all, GET/POST by ID, SLA checks
│   │   ├── chat/             # POST — citizen chat (MCP gateway + fallback)
│   │   ├── chats/            # Conversation CRUD (list, get messages, delete)
│   │   ├── gateway/          # ingest (from MCP gateway), health check
│   │   ├── ingest/           # Direct case ingestion (training data format)
│   │   └── policy/decide/    # Policy engine evaluation endpoint
│   ├── approver/
│   │   ├── login/            # Approver sign-in (Supabase Auth)
│   │   └── register/         # Approver account creation
│   ├── audit/                # Audit log viewer page
│   ├── cases/                # Approver case review dashboard
│   │   ├── [id]/             # Individual case detail + DecisionPanel
│   │   └── CasesTableClient  # Alternative table view
│   ├── chat/                 # Citizen chat interface
│   ├── login/                # Citizen login
│   ├── register/             # Citizen registration
│   ├── reset-password/       # Password reset
│   ├── settings/             # Approver settings (theme, shortcuts, etc.)
│   └── update-password/      # Password update
├── components/
│   ├── app/                  # App-specific components (approver-topbar)
│   ├── ui/                   # shadcn/ui primitives
│   └── settings-provider.tsx # Settings context provider
├── data/
│   └── mock_cases.json       # Seed data / fallback cases
└── lib/
    ├── actionExecutionStore.ts   # Execute + log approved actions
    ├── approvers.ts              # Approver profiles and validation
    ├── auditStore.ts             # Audit event persistence (Supabase)
    ├── auth.ts                   # Session management (JWT cookies)
    ├── authStore.ts              # Legacy auth helpers
    ├── caseStore.ts              # Case CRUD + decision logic + gateway notify
    ├── gatewayClient.ts          # HTTP client for Atlas-MCP-Gateway
    ├── getAuthUser.ts            # Extract user from Supabase auth cookies
    ├── mcpClient.ts              # MCP tool call client (SSE streaming)
    ├── notificationSound.ts      # Web Audio API chime (urgent / normal)
    ├── policyEngine.ts           # NIST AI RMF rule evaluation
    ├── policyRulesStore.ts       # Configurable policy rules
    ├── schema.ts                 # Zod schemas for case records
    ├── settings.ts               # Settings types and persistence
    ├── slaChecker.ts             # SLA enforcement + expiration
    ├── supabaseAdmin.ts          # Supabase service-role client
    ├── supabaseClient.ts         # Supabase browser client (cookie storage)
    ├── theme.ts                  # Theme preference helpers
    ├── userSettings.ts           # User settings (localStorage)
    └── utils.ts                  # Tailwind class merge utility
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project
- (Optional) [Atlas-MCP-Gateway](https://github.com/aidant64/Atlas-MCP-Gateway) deployed for live MCP tool calls

### Installation

```bash
git clone https://github.com/kr4k3n22/atlas.git
cd atlas
npm install
```

### Configure Environment

Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

See [Environment Variables](#environment-variables) below for the full list.

### Database Setup

Create the following tables in your Supabase project:

1. **`approval_queue`** — Stores cases for HITL review
2. **`audit_log`** — Immutable audit trail
3. **`action_executions`** — Records of executed actions
4. **`conversations`** — Chat conversation metadata
5. **`chat_messages`** — Individual chat messages

Enable **Realtime** on `approval_queue` and `chat_messages` tables in your Supabase dashboard (Database → Replication → Realtime).

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_URL` | ✅ | Supabase project URL (server-side) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only) |
| `OPENAI_API_KEY` | ⬜ | OpenAI API key for function-calling and fallback responses |
| `OPENAI_MODEL` | ⬜ | OpenAI model name (defaults to `gpt-4o`) |
| `NEXT_PUBLIC_MCP_GATEWAY_URL` | ⬜ | Atlas-MCP-Gateway URL for live tool calls |
| `GATEWAY_SHARED_SECRET` | ⬜ | Shared Bearer token for Gateway ↔ ATLAS auth |
| `GATEWAY_URL` | ⬜ | Gateway URL for decision notifications |
| `AUTH_SECRET` | ✅ | JWT signing secret for session cookies (min 16 chars) |

---

## Database Schema

### Welfare Claims Schema (Production)

The production schema is implemented as a set of idempotent SQL migration files in `supabase/migrations/`. It uses four PostgreSQL schemas to separate concerns:

| Schema | Purpose |
|--------|---------|
| `ref` | Code/lookup tables (status codes, types, etc.) |
| `app` | Operational fact tables (claimants, income, assets, decisions) |
| `audit` | Append-only audit trail |
| `reporting` | Read-only views for downstream consumers |

#### Migration Files

| File | Description |
|------|-------------|
| `001_create_policy_rules_table.sql` | Policy rules for NIST AI RMF risk scoring |
| `002_seed_policy_rules.sql` | Seed policy rule values |
| `003_create_chat_tables.sql` | Conversations and chat messages |
| `004_extensions.sql` | Enable `pgcrypto` and `citext` |
| `005_schemas.sql` | Create `ref`, `app`, `audit`, `reporting` schemas |
| `006_code_tables.sql` | All reference/lookup code tables |
| `007_core_entities.sql` | `claimant`, `household`, `application`, `application_program` |
| `008_fact_tables_identity_household.sql` | Address, identity, demographic eligibility facts |
| `009_fact_tables_income_employment.sql` | Employment, wage, earned income, benefit facts |
| `010_fact_tables_assets_expenses_hardship.sql` | Bank accounts, assets, expenses, hardship indicators |
| `011_evidence_tables.sql` | Document evidence, extracted fields, field links |
| `012_rules_and_decisions.sql` | Rule catalog, decisions, rule evaluations |
| `013_audit_tables.sql` | `audit.audit_event` table and `audit.log_row_change()` trigger |
| `014_triggers_and_updated_at.sql` | `set_updated_at()` and audit triggers on high-impact tables |
| `015_indexes.sql` | Indexes for common query patterns |
| `016_seed_code_tables.sql` | All code table seed values |
| `017_seed_test_data.sql` | Realistic UK welfare test data (5 claimants, GBP amounts) |
| `018_views_reporting.sql` | Reporting views (`v_application_current_profile`, etc.) |
| `019_roles.sql` | Database roles with least-privilege access |
| `999_verification_tests.sql` | Self-validating test script (run after migrations) |

#### Running Migrations

Apply migrations in order using the Supabase CLI or directly via `psql`:

```bash
# Using Supabase CLI
supabase db push

# Or apply individually via psql
psql "$DATABASE_URL" -f supabase/migrations/004_extensions.sql
psql "$DATABASE_URL" -f supabase/migrations/005_schemas.sql
# ... (continue in order)
```

#### Key Design Decisions

- **Money as integer minor units** — all monetary amounts stored as `bigint` in pence (GBP). Never float.
- **Code tables for all status fields** — no free-text status columns; every status references a `ref.code_*` table.
- **Fact provenance** — every fact table includes `source_code`, `verification_status_code`, `confidence_score`, and actor metadata.
- **Distinguishing nulls** — `unknown` / `not_applicable` / `not_provided` / `pending_verification` are explicit code values, not SQL NULL.
- **Audit triggers** — all high-impact tables write to `audit.audit_event` via the reusable `audit.log_row_change()` trigger function.

#### Adding New Code Values

Insert a new row into the appropriate `ref.code_*` table:

```sql
INSERT INTO ref.code_application_status (code, label, description, sort_order)
VALUES ('under_appeal', 'Under Appeal', 'Application is being appealed', 9);
```

#### Adding New Rule Versions

Insert a new row into `app.rule_catalog` with an incremented `rule_version`:

```sql
INSERT INTO app.rule_catalog (rule_key, rule_version, program_type_code, description, effective_from)
VALUES ('UC_INCOME_THRESHOLD', 2, 'universal_credit', 'Updated UC income threshold check', '2025-04-01');
```

### Legacy Operational Tables

| Table | Description |
|-------|-------------|
| `approval_queue` | Stores cases for HITL review |
| `audit_log` | Immutable audit trail |
| `action_executions` | Records of executed actions |
| `conversations` | Chat conversation metadata |
| `chat_messages` | Individual chat messages |



| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | Case ID (e.g., `CASE-A1B2C3`) |
| `created_at` | timestamptz | When the case was created |
| `status` | text | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `NEEDS_MORE_INFO`, `EXPIRED` |
| `user_display` | text | Citizen display name |
| `user_message` | text | Original user message/intent |
| `tool_name` | text | MCP tool that was intercepted |
| `tool_args_redacted` | jsonb | Tool arguments (PII-redacted) |
| `risk_label` | text | `ROUTINE`, `ESCALATE`, `BLOCK` |
| `risk_score` | integer | 0–100 risk score |
| `risk_rationale` | text | Why this risk level was assigned |
| `policy_refs` | jsonb | NIST AI RMF policy references |
| `history` | jsonb | Array of audit trail events |

### `conversations`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Conversation ID |
| `user_id` | uuid (FK) | Supabase auth user ID |
| `title` | text | Conversation title (first message) |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last activity timestamp |

### `chat_messages`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Message ID |
| `conversation_id` | uuid (FK) | Parent conversation |
| `role` | text | `user` or `assistant` |
| `content` | text | Message content |
| `metadata` | jsonb | Optional metadata |
| `created_at` | timestamptz | Timestamp |

---

## API Reference

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Send a message. Maps to MCP tool calls or fallback responses. Creates/continues conversations. |
| `GET` | `/api/chats` | List conversations for authenticated user |
| `GET` | `/api/chats/[id]` | Get messages for a conversation |
| `DELETE` | `/api/chats/[id]` | Delete a conversation |

### Cases

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cases` | List all cases |
| `GET` | `/api/cases/[id]` | Get a single case |
| `POST` | `/api/cases/[id]` | Submit a decision (APPROVE / REJECT / REQUEST_INFO) |
| `GET` | `/api/cases/check-sla` | Get cases approaching SLA deadline |
| `POST` | `/api/cases/check-sla` | Check and expire stale cases |
| `GET` | `/api/cases/[id]/decision` | Individual case decision endpoint |

### Gateway Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/gateway/ingest` | Receive risk-scored tool calls from MCP Gateway (Bearer auth) |
| `GET` | `/api/gateway/health` | Proxy health check for MCP Gateway |

### Policy & Ingestion

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/policy/decide` | Evaluate a welfare decision against NIST AI RMF policy rules |
| `POST` | `/api/ingest` | Direct case ingestion (structured training data format) |
| `POST` | `/api/actions/execute` | Execute an approved action |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/me` | Get current session |
| `POST` | `/api/auth/logout` | Sign out |

---

## User Roles

### Citizen (End User)
- Accesses `/chat` to interact with the welfare services chatbot
- Registers and logs in via `/login` and `/register`
- Receives real-time updates when an approver acts on their escalated request

### Approver (HITL Reviewer)
- Accesses `/cases` to review the case queue
- Logs in via `/approver/login` (role validated via `user_metadata.role === "approver"`)
- Makes three types of decisions:
  - **Approve** — executes the action and notifies the citizen
  - **Reject** — blocks the action and notifies the citizen
  - **Request Info** — pauses review and asks the citizen for more details
- Configures preferences via `/settings`

---

## How It Works

### Chat Agent — Claimant Data Grounding

Before every AI response, the chat route queries the welfare-claims SQL schema via `src/lib/beneficiaryStore.ts` to look up the claimant's profile:

1. **Profile lookup** — `getClaimantProfile(beneficiaryId)` queries `app.claimant`, joined with household, employment, income, and application data via the `external_claimant_ref` (e.g. `BEN-ATLAS-001`)
2. **Context injection** — if a profile is found, `buildProfileContext()` formats a summary string that is injected into the OpenAI system prompt
3. **No-hallucination instruction** — the system prompt includes: _"Only use the provided claimant data. If information is missing, ask the user to provide it. Do not make up or assume any facts."_
4. **Missing profile** — if no records are found, the agent explicitly tells the user it cannot find their records and asks them to confirm their reference or provide identifying information

The context block injected into the system prompt includes:
- Claimant name and external reference
- Household size
- Current employment status
- Total earned income (last 6 months, GBP)
- Current application status and programmes
- Latest decision result and reason codes

### End-to-End Flow

1. **Citizen sends a message** in `/chat` → `POST /api/chat`
2. **Claimant profile is looked up** from the SQL database (`app.claimant` and related tables)
3. **Message is mapped to an MCP tool call** (e.g., `check_payment_status`, `request_payment_extension`)
4. **Tool call is sent to the MCP Gateway** which risk-scores it via a Modal SLM
5. **If high risk**, the Gateway returns an escalation → ATLAS creates a case in `approval_queue`
6. **The citizen sees an escalation banner** with a case reference number
7. **An approver sees the case appear** in real-time in `/cases` (via Supabase Realtime)
8. **The approver reviews** structured inputs, risk assessment, harm/rights signals, and policy references
9. **The approver makes a decision** (Approve / Reject / Request Info) with a mandatory note
10. **On Approve**: the action is executed via `actionExecutionStore`, and a confirmation message is written to the citizen's chat
11. **On Reject/Request Info**: a notification message is written to the citizen's chat
12. **The Gateway is notified** via an Inngest event (`atlas/sarah.decision`) to resume the paused workflow
13. **Everything is logged** in the audit trail

### Without MCP Gateway (Fallback Mode)

When the Gateway is not configured, the chat API uses regex-based pattern matching to provide informational responses about unemployment benefits, eligibility, documents, and appeals. Escalation patterns (e.g., "submit", "apply now") generate case references and create records in the approval queue. The claimant data grounding still applies in fallback mode.

---

## Related Repositories

| Repository | Description |
|-----------|-------------|
| [aidant64/Atlas-MCP-Gateway](https://github.com/aidant64/Atlas-MCP-Gateway) | Python/FastMCP gateway with Inngest durable workflows, Modal SLM risk inference, and MCP tool interception |

---

## Roadmap

- [ ] **Pre-escalation clarifying questions** — chatbot interviews user to gather justification before escalating
- [ ] **Post-approval continuation** — chatbot narrates the outcome of approved actions back to the citizen
- [ ] **REQUEST_INFO round-trip** — citizen replies route back to the case for approver re-review
- [ ] **Conversation state management** — track where the user is in the intake flow
- [ ] **Document upload** — allow citizens to upload supporting documents through the chat
- [ ] **Multi-language support** — engagement barrier accommodation
- [ ] **Analytics dashboard** — approval rates, average review times, SLA compliance metrics

---

## License

This project is currently unlicensed. Contact the maintainers for usage terms.
