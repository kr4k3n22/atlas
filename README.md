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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (server-side only) |
| `NEXT_PUBLIC_MCP_GATEWAY_URL` | ⬜ | Atlas-MCP-Gateway URL for live tool calls |
| `GATEWAY_SHARED_SECRET` | ⬜ | Shared Bearer token for Gateway ↔ ATLAS auth |
| `GATEWAY_URL` | ⬜ | Gateway URL for decision notifications |

---

## Database Schema

### `approval_queue`

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

### End-to-End Flow

1. **Citizen sends a message** in `/chat` → `POST /api/chat`
2. **Message is mapped to an MCP tool call** (e.g., `check_payment_status`, `request_payment_extension`)
3. **Tool call is sent to the MCP Gateway** which risk-scores it via a Modal SLM
4. **If high risk**, the Gateway returns an escalation → ATLAS creates a case in `approval_queue`
5. **The citizen sees an escalation banner** with a case reference number
6. **An approver sees the case appear** in real-time in `/cases` (via Supabase Realtime)
7. **The approver reviews** structured inputs, risk assessment, harm/rights signals, and policy references
8. **The approver makes a decision** (Approve / Reject / Request Info) with a mandatory note
9. **On Approve**: the action is executed via `actionExecutionStore`, and a confirmation message is written to the citizen's chat
10. **On Reject/Request Info**: a notification message is written to the citizen's chat
11. **The Gateway is notified** via an Inngest event (`atlas/sarah.decision`) to resume the paused workflow
12. **Everything is logged** in the audit trail

### Without MCP Gateway (Fallback Mode)

When the Gateway is not configured, the chat API uses regex-based pattern matching to provide informational responses about unemployment benefits, eligibility, documents, and appeals. Escalation patterns (e.g., "submit", "apply now") generate case references and create records in the approval queue.

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
