# SQL CHECK Constraint Issue - Resolution

## Problem Statement
User reported the following SQL error when trying to create the `policy_rules` table:

```
Error: Failed to run sql query: ERROR: 42804: argument of CHECK must be type boolean, not type integer LINE 8: risk_threshold INTEGER CHECK (0-100), ^
```

## Investigation Results

### ✅ Migration Files Are Correct

After thorough investigation, I confirmed that **all SQL migration files in this repository have the correct syntax**.

**File:** `supabase/migrations/001_create_policy_rules_table.sql`  
**Line 15:** 
```sql
risk_threshold INTEGER NOT NULL CHECK (risk_threshold >= 0 AND risk_threshold <= 100),
```

This is **100% valid PostgreSQL syntax** and will execute successfully.

### ❌ What Caused the Error

The error message shows `CHECK (0-100)` which is **invalid SQL syntax** for several reasons:

1. **PostgreSQL interprets `(0-100)` as integer subtraction**: `0 - 100 = -100`
2. **CHECK constraints require boolean expressions**: The result must be `true` or `false`
3. **An integer value (-100) is not a boolean**: Hence the error "argument of CHECK must be type boolean, not type integer"

### 🔍 Why This Happened

The user likely encountered this because:

1. **Manually typed the SQL** instead of copying from the migration file
2. **Copied from a description/comment** where `(0-100)` appears as shorthand notation for "valid range is 0 to 100"
3. **Used an external resource** with incorrect SQL syntax

## ✅ Solution

### Option 1: Use the Migration Files (Recommended)

The migration files in this repository are correct. Simply use them:

```bash
# Navigate to your Supabase dashboard SQL Editor
# Copy the ENTIRE contents of:
supabase/migrations/001_create_policy_rules_table.sql

# Paste and execute in Supabase SQL Editor
```

### Option 2: Use Correct SQL Syntax

If you need to write the SQL manually, use this correct syntax:

```sql
CREATE TABLE IF NOT EXISTS policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  rule_name TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  description TEXT,
  
  -- CORRECT: CHECK constraint with boolean expression
  risk_threshold INTEGER NOT NULL CHECK (risk_threshold >= 0 AND risk_threshold <= 100),
  risk_weight DECIMAL(5,2) DEFAULT 1.0,
  
  pattern_regex TEXT,
  pattern_field TEXT,
  policy_refs JSONB DEFAULT '[]'::jsonb,
  conditions JSONB DEFAULT '{}'::jsonb,
  
  priority INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT true,
  
  CONSTRAINT unique_rule_name UNIQUE (rule_name)
);
```

## 📚 Understanding CHECK Constraints

### Correct Syntax Examples

```sql
-- Range check (what we need)
CHECK (risk_threshold >= 0 AND risk_threshold <= 100)

-- Single boundary
CHECK (age >= 18)

-- Multiple conditions with OR
CHECK (status IN ('active', 'pending', 'closed'))

-- Complex boolean expression
CHECK (start_date < end_date OR end_date IS NULL)
```

### Incorrect Syntax Examples

```sql
-- ❌ WRONG: This is integer subtraction (0-100 = -100), not a boolean
CHECK (0-100)

-- ❌ WRONG: Missing column reference
CHECK (>= 0 AND <= 100)

-- ❌ WRONG: This is a string, not a boolean expression
CHECK ('0-100')
```

## 🧪 Testing the Fix

You can verify the correct syntax works by running this test SQL:

```sql
-- Create a test table with correct syntax
CREATE TEMP TABLE test_check_constraint (
    id SERIAL PRIMARY KEY,
    risk_threshold INTEGER NOT NULL CHECK (risk_threshold >= 0 AND risk_threshold <= 100)
);

-- These should succeed
INSERT INTO test_check_constraint (risk_threshold) VALUES (0);
INSERT INTO test_check_constraint (risk_threshold) VALUES (50);
INSERT INTO test_check_constraint (risk_threshold) VALUES (100);

-- These should fail (constraint violation)
-- INSERT INTO test_check_constraint (risk_threshold) VALUES (-1);
-- INSERT INTO test_check_constraint (risk_threshold) VALUES (101);

-- Cleanup
DROP TABLE test_check_constraint;
```

## 📖 Additional Resources

- **Troubleshooting Guide:** See `TROUBLESHOOTING.md` in the repository root
- **Migration Instructions:** See `supabase/migrations/README.md`
- **PostgreSQL CHECK Constraint Docs:** https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS

## ✅ Verification Checklist

After applying the migration:

- [ ] Table `policy_rules` exists in Supabase
- [ ] Can insert rows with risk_threshold values 0-100
- [ ] Attempting to insert -1 or 101 raises constraint violation error
- [ ] Indexes are created (`idx_policy_rules_tool_name`, etc.)
- [ ] Seed data from `002_seed_policy_rules.sql` loads successfully (10 rows)

## 🎯 Summary

**The repository migration files are correct.** The error occurred because invalid syntax was used somewhere outside of these files. To resolve:

1. Use the migration files from `supabase/migrations/` directly
2. Do not manually type SQL - always copy from the source files
3. The correct CHECK syntax is: `CHECK (risk_threshold >= 0 AND risk_threshold <= 100)`

---

**Status:** ✅ Resolved - No code changes needed, documentation enhanced for clarity
