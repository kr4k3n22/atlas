# Supabase Migrations

This directory contains SQL migration files for the Atlas HITL system.

## ⚠️ IMPORTANT: SQL Syntax

These files contain **production-ready SQL** with proper syntax. 

**DO NOT modify the SQL syntax.** Common mistakes:

❌ **WRONG:** `CHECK (0-100)` - This is invalid SQL  
✅ **CORRECT:** `CHECK (risk_threshold >= 0 AND risk_threshold <= 100)` - This is the proper CHECK constraint syntax

The files in this directory already have the correct syntax.

## Migration Overview

### Active Schema (apply these in order)

| Migration | Purpose |
|-----------|---------|
| `001_create_policy_rules_table.sql` | Policy rules table |
| `002_seed_policy_rules.sql` | Seed data for policy rules |
| `003_create_chat_tables.sql` | Chat infrastructure (conversations, messages) |
| `004_extensions.sql` | PostgreSQL extensions (pgcrypto, uuid-ossp) |
| `005_schemas.sql` | Schema creation — **still required** for `app` schema |
| `021_claimant_case_table.sql` | Consolidated `app.claimant_case` table (IntakePayload as JSONB) |
| `022_seed_claimant_case_scenarios.sql` | Demo scenario seed data (BEN-ATLAS-001 through 004) |
| `023_rpc_claimant_case.sql` | RPC functions for claimant case queries |
| `024_drop_legacy_rpcs.sql` | Removes old RPC functions from migration 020 |
| `025_drop_legacy_schema_005_019.sql` | Drops all legacy normalized tables (006–019) |
| `026_final_cleanup.sql` | Final cleanup: drops legacy schemas, cleans up roles |

### Legacy Migrations (superseded — do not apply to a fresh database)

Migrations `006` through `020` defined the old normalized SQL schema
(`app.claimant`, `app.household`, `app.application`, `app.employment_fact`, etc.)
and have been fully superseded by `021_claimant_case_table.sql`. They are
retained for historical reference only. Migrations `025` and `026` drop all
artifacts introduced by `006`–`020`.

## How to Apply Migrations

### Method 1: Supabase CLI (Recommended)
```bash
cd /path/to/atlas
supabase db push
```

### Method 2: Manual SQL Execution
1. Log into your Supabase dashboard
2. Navigate to SQL Editor
3. Copy the **entire contents** of `001_create_policy_rules_table.sql`
4. Paste into SQL Editor
5. Click "Run" or press `Ctrl+Enter`
6. Verify success message
7. Repeat for each subsequent migration in order

## Migration Files

### 001_create_policy_rules_table.sql
Creates the `policy_rules` table with:
- UUID primary key
- Proper CHECK constraints for data validation
- GIN indexes for JSONB columns
- Filtered indexes for performance

### 002_seed_policy_rules.sql
Inserts 10 default policy rules:
- Fraud detection
- Harm/rights signals
- Evidence quality checks
- Document validation
- Accessibility barriers
- Benefits overlap
- Identity verification
- Routine case handling
- Appeals processing
- Deadline management

## Troubleshooting

### Error: "argument of CHECK must be type boolean"
This error indicates invalid CHECK constraint syntax. 

**Solution:** Use the migration files from this directory as-is. Do not manually type or modify the SQL.

### Error: "column already exists"
The table was already created. You can either:
- Drop the table: `DROP TABLE IF EXISTS policy_rules CASCADE;`
- Skip this migration if the schema matches

### Error: "duplicate key value violates unique constraint"
The seed data was already inserted. You can either:
- Clear existing data: `DELETE FROM policy_rules;`
- Skip the seed migration if data already exists

## Verification

After running migrations, verify with:

```sql
-- Check active app tables (should only return claimant_case)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'app'
  AND table_type = 'BASE TABLE';

-- Check claimant case records (should return 4 demo scenarios)
SELECT beneficiary_id, claimant_name, scenario_id FROM app.claimant_case;

-- Check policy rules
SELECT COUNT(*) FROM policy_rules;
-- Should return 10 rows if seed data was applied
```

## Need Help?

See `TROUBLESHOOTING.md` in the repository root for common issues and solutions.

