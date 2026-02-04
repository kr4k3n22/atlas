# Troubleshooting Guide

## SQL Error: CHECK constraint syntax

### Error Message
```
ERROR: 42804: argument of CHECK must be type boolean, not type integer
LINE 8: risk_threshold INTEGER CHECK (0-100),
```

### Problem
The error occurs when using invalid SQL syntax for a CHECK constraint. The syntax `CHECK (0-100)` is **incorrect**.

### Solution
The correct SQL syntax for a CHECK constraint that validates a range is:

**❌ INCORRECT:**
```sql
risk_threshold INTEGER CHECK (0-100)
```

**✅ CORRECT:**
```sql
risk_threshold INTEGER NOT NULL CHECK (risk_threshold >= 0 AND risk_threshold <= 100)
```

### Verification
The migration file at `supabase/migrations/001_create_policy_rules_table.sql` contains the **correct syntax** on line 15.

If you encounter this error:
1. Verify you're using the migration files from this repository
2. Do not manually edit the SQL - use the provided migration files as-is
3. Clear any cached SQL and re-run the migration
4. Ensure you're not copying SQL from documentation comments (which use shorthand notation for description purposes only)

### How to Apply
1. Open Supabase SQL Editor
2. Copy the **entire contents** of `supabase/migrations/001_create_policy_rules_table.sql`
3. Paste and run in the SQL Editor
4. Verify the table was created successfully
5. Run `002_seed_policy_rules.sql` to populate initial data

### Complete Correct SQL
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

### Note on Documentation
In documentation and comments, you may see the notation `(0-100)` used to **describe** the valid range. This is shorthand for human readers and is **NOT** valid SQL syntax. Always use the actual SQL files for execution.
