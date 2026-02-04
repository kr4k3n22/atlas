# Supabase Migrations

This directory contains SQL migration files for the Atlas HITL system.

## ⚠️ IMPORTANT: SQL Syntax

These files contain **production-ready SQL** with proper syntax. 

**DO NOT modify the SQL syntax.** Common mistakes:

❌ **WRONG:** `CHECK (0-100)` - This is invalid SQL  
✅ **CORRECT:** `CHECK (risk_threshold >= 0 AND risk_threshold <= 100)` - This is the proper CHECK constraint syntax

The files in this directory already have the correct syntax.

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
7. Repeat for `002_seed_policy_rules.sql`

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
-- Check table exists
SELECT COUNT(*) FROM policy_rules;

-- Should return 10 rows if seed data was applied

-- View table structure
\d policy_rules

-- Or in Supabase dashboard: Table Editor > policy_rules
```

## Need Help?

See `TROUBLESHOOTING.md` in the repository root for common issues and solutions.
