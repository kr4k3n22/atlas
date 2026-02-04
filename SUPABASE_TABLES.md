# Supabase Database Schema Documentation

This document describes the Supabase tables used by the Atlas HITL (Human-in-the-Loop) system.

> **⚠️ IMPORTANT:** When applying these SQL migrations, copy the SQL files from `supabase/migrations/` directory directly. Do NOT manually type SQL from the documentation as it may contain descriptive shorthand notation (like "0-100" in descriptions) which is not valid SQL syntax.

## Tables Overview

### 1. `policy_rules` Table

Stores policy rules for risk scoring and decision-making.

#### Schema

```sql
CREATE TABLE IF NOT EXISTS policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Rule identification
  rule_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  description TEXT,
  
  -- Risk scoring
  risk_threshold INTEGER NOT NULL CHECK (risk_threshold >= 0 AND risk_threshold <= 100),
  risk_weight DECIMAL(5,2) DEFAULT 1.0,
  
  -- Pattern matching for heuristic scoring
  pattern_regex TEXT,
  pattern_field TEXT,
  
  -- Policy references
  policy_refs JSONB DEFAULT '[]'::jsonb,
  
  -- Rule conditions (JSONB for flexible matching)
  conditions JSONB DEFAULT '{}'::jsonb,
  
  -- Rule metadata
  priority INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT true,
  
  CONSTRAINT unique_rule_name UNIQUE (rule_name)
);
```

#### Indexes

- `idx_policy_rules_tool_name` - Filters enabled rules by tool name
- `idx_policy_rules_priority` - Orders rules by priority
- `idx_policy_rules_enabled` - Filters by enabled status
- `idx_policy_rules_conditions` - GIN index for JSONB conditions queries

#### Columns Description

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `rule_name` | TEXT | Unique rule identifier |
| `tool_name` | TEXT | Tool this rule applies to (supports wildcards like `benefit_%`) |
| `description` | TEXT | Human-readable description of the rule |
| `risk_threshold` | INTEGER | Risk score threshold (0-100) |
| `risk_weight` | DECIMAL | Weight factor for score calculation (default 1.0) |
| `pattern_regex` | TEXT | Optional regex for pattern matching |
| `pattern_field` | TEXT | Field to apply regex on |
| `policy_refs` | JSONB | Array of policy reference codes |
| `conditions` | JSONB | Rule matching conditions (flexible structure) |
| `priority` | INTEGER | Rule evaluation priority (lower = higher priority) |
| `enabled` | BOOLEAN | Whether the rule is active |

#### Example Seed Data

```sql
-- Fraud detection rule
INSERT INTO policy_rules (rule_name, tool_name, description, risk_threshold, risk_weight, pattern_regex, pattern_field, policy_refs, conditions, priority, enabled) VALUES
(
  'fraud_confirmed_rule',
  'benefit_%',
  'Confirmed fraud signals require immediate escalation',
  90,
  2.0,
  '(confirmed|verified)',
  'fraud_signals',
  '["POLICY-FRAUD-005", "POLICY-BLOCK-006"]'::jsonb,
  '{"fraud_signals": {"match_any": ["confirmed"]}}'::jsonb,
  10,
  true
);
```

### 2. `approval_queue` Table (Existing)

Stores cases pending review.

#### Key Fields
- `id` - Case identifier (e.g., "CASE-ABC123")
- `created_at` - Case creation timestamp
- `status` - Current status: `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `NEEDS_MORE_INFO`, `EXPIRED`
- `user_display` - User who initiated the action
- `tool_name` - Tool being invoked
- `tool_args_redacted` - Redacted tool arguments
- `risk_label` - Risk classification: `ROUTINE`, `ESCALATE`, `BLOCK`
- `risk_score` - Computed risk score (0-100)
- `risk_rationale` - Explanation for risk score
- `policy_refs` - Array of policy references that applied
- `history` - Array of audit trail entries

### 3. `audit_log` Table (Existing)

Stores audit trail events.

#### Key Fields
- `ts` - Event timestamp
- `actor` - Who performed the action (e.g., "reviewer", "system", "proxy")
- `action` - Action type (e.g., "case_created", "decision_approve", "case_expired")
- `case_id` - Related case identifier
- `detail` - Additional context

### 4. `action_executions` Table (Existing)

Logs executed tool actions.

#### Key Fields
- `case_id` - Related case identifier
- `requested_by` - User who requested the action
- `approver` - Who approved the action
- `tool_name` - Tool that was executed
- `tool_args` - Arguments passed to the tool
- `decision_source` - How the decision was made

## Setup Instructions

### 1. Run Migrations

> **📝 Note:** Copy SQL content directly from the migration files. The SQL syntax must be exact - use the files in `supabase/migrations/` as-is.

Execute the migration files in order:

```bash
# Using Supabase CLI
supabase db push

# Or manually run SQL files in the Supabase dashboard
# Run in order:
# 1. 001_create_policy_rules_table.sql
# 2. 002_seed_policy_rules.sql
```

**For Manual Execution:**
1. Open Supabase SQL Editor
2. Copy the **entire contents** of `supabase/migrations/001_create_policy_rules_table.sql`
3. Paste into SQL Editor and execute
4. Verify success (you should see "Success. No rows returned")
5. Repeat for `002_seed_policy_rules.sql`

### 2. Configure Environment Variables

Add to your `.env.local` or production environment:

```bash
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Set Up Row-Level Security (RLS)

For production, enable RLS policies:

```sql
-- Enable RLS on policy_rules
ALTER TABLE policy_rules ENABLE ROW LEVEL SECURITY;

-- Allow service role to read/write
CREATE POLICY "Service role full access" ON policy_rules
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Allow authenticated users to read enabled rules
CREATE POLICY "Authenticated users can read enabled rules" ON policy_rules
  FOR SELECT
  USING (enabled = true);
```

## Usage Examples

### Querying Policy Rules

```typescript
import { getPolicyRulesForTool } from "@/lib/policyRulesStore";

// Get all rules for benefit approval
const rules = await getPolicyRulesForTool("benefit_approve");

// Match rules against input data
const matchedRules = matchRulesAgainstInput(rules, inputData);

// Compute risk score
const { score, rationale, policy_refs } = computeAggregateRiskScore(matchedRules, inputData);
```

### Checking SLA

```typescript
import { checkAndExpireStaleCases } from "@/lib/slaChecker";

// Manual SLA check
const result = await checkAndExpireStaleCases();
console.log(`Expired ${result.expired} cases: ${result.cases.join(", ")}`);
```

### API Endpoint

```bash
# Trigger SLA check
curl -X POST http://localhost:3000/api/cases/check-sla

# Get cases approaching SLA
curl http://localhost:3000/api/cases/check-sla
```

## Phase 3 & 4 Implementation Summary

### Phase 3: Risk Scoring + Policy Rules
- ✅ Policy rules stored in database with flexible condition matching
- ✅ Rules support wildcards (e.g., `benefit_%` matches all benefit tools)
- ✅ Heuristic risk scoring with regex pattern matching
- ✅ Weighted aggregate scores from multiple rules
- ✅ Policy references dynamically sourced from matched rules

### Phase 4: Human Oversight UX
- ✅ REQUEST_INFO decision moves cases to `NEEDS_MORE_INFO` status
- ✅ Request-info notes persisted in case history
- ✅ Audit trail entries for all status transitions
- ✅ 72-hour SLA escalation system
- ✅ Automatic EXPIRED status for stale cases
- ✅ UI surfaces all status states including EXPIRED
- ✅ API endpoint for manual SLA checks

## File Locations

- **Migrations**: `/supabase/migrations/`
  - `001_create_policy_rules_table.sql`
  - `002_seed_policy_rules.sql`
- **Policy Rules Store**: `/src/lib/policyRulesStore.ts`
- **SLA Checker**: `/src/lib/slaChecker.ts`
- **Policy Engine**: `/src/lib/policyEngine.ts` (updated)
- **Case Store**: `/src/lib/caseStore.ts` (updated)
- **API Endpoint**: `/src/app/api/cases/check-sla/route.ts`

## Maintenance

### Adding New Rules

Insert directly into the `policy_rules` table or create new migration files:

```sql
INSERT INTO policy_rules (rule_name, tool_name, risk_threshold, policy_refs, priority) 
VALUES ('new_rule', 'benefit_approve', 65, '["POLICY-NEW-001"]'::jsonb, 50);
```

### Updating Rule Priority

```sql
UPDATE policy_rules 
SET priority = 5 
WHERE rule_name = 'fraud_confirmed_rule';
```

### Disabling a Rule

```sql
UPDATE policy_rules 
SET enabled = false 
WHERE rule_name = 'some_rule';
```
