# Quick Start: Applying Supabase Migrations

## 📂 Where Are The Files?

The SQL migration files are located in your repository at:

```
atlas/
└── supabase/
    └── migrations/
        ├── 001_create_policy_rules_table.sql  ← Table creation
        ├── 002_seed_policy_rules.sql          ← Seed data
        └── README.md                          ← Instructions
```

**On GitHub:** Navigate to `supabase/migrations/` folder in your repository  
**Locally:** `cd supabase/migrations/`

## 🚀 Fast Setup (3 Steps)

### Step 1: Open Supabase SQL Editor
Log into your Supabase dashboard → SQL Editor

### Step 2: Run Table Creation
```sql
-- Copy ENTIRE file content from:
supabase/migrations/001_create_policy_rules_table.sql
-- (Located in your repository at: ./supabase/migrations/)

-- Paste and execute (Ctrl+Enter)
-- Expected: "Success. No rows returned"
```

### Step 3: Run Seed Data
```sql
-- Copy ENTIRE file content from:
supabase/migrations/002_seed_policy_rules.sql
-- (Located in your repository at: ./supabase/migrations/)

-- Paste and execute (Ctrl+Enter)
-- Expected: "Success. 10 rows inserted"
```

## ✅ Verify Success

```sql
SELECT COUNT(*) FROM policy_rules;
-- Should return: 10
```

## ⚠️ Common Mistakes

### ❌ DON'T:
- Manually type the SQL
- Copy from documentation (which uses shorthand)
- Modify the migration files
- Use `CHECK (0-100)` syntax

### ✅ DO:
- Copy from actual migration files
- Use files as-is without changes
- Use `CHECK (risk_threshold >= 0 AND risk_threshold <= 100)` syntax

## 🆘 Having Issues?

See detailed guides:
- **General Issues:** `TROUBLESHOOTING.md`
- **CHECK Constraint Error:** `SQL_CHECK_CONSTRAINT_RESOLUTION.md`
- **Migration Details:** `supabase/migrations/README.md`

## 📊 What You Get

After successful migration:
- ✅ `policy_rules` table with 10 default rules
- ✅ Optimized indexes for performance
- ✅ CHECK constraints for data validation
- ✅ Ready for Phase 3 & 4 features

## 🔄 Next Steps

After migrations complete:
1. Set environment variables (see `SUPABASE_TABLES.md`)
2. Deploy your application
3. Test policy evaluation endpoint: `POST /api/policy/decide`
4. Test SLA checker endpoint: `POST /api/cases/check-sla`

---

**Need the actual SQL files?**  
They're in: `supabase/migrations/`
- `001_create_policy_rules_table.sql`
- `002_seed_policy_rules.sql`
