# File Location Reference

## Where Are The SQL Migration Files?

The SQL migration files **ARE ALREADY IN YOUR REPOSITORY** at this location:

```
📁 atlas/                                    ← Your repository root
│
├── 📄 README.md
├── 📄 QUICK_START.md                        ← Start here for setup
├── 📄 SUPABASE_TABLES.md                    ← Schema documentation
├── 📄 TROUBLESHOOTING.md                     ← Help with errors
├── 📄 SQL_CHECK_CONSTRAINT_RESOLUTION.md    ← CHECK syntax guide
│
├── 📂 src/                                  ← Application code
│   ├── app/
│   ├── components/
│   └── lib/
│
├── 📂 supabase/                             ← ⭐ MIGRATION FILES HERE ⭐
│   └── 📂 migrations/                       ← ⭐ LOOK HERE ⭐
│       ├── 📄 001_create_policy_rules_table.sql   ✓ Table creation (2,047 bytes)
│       ├── 📄 002_seed_policy_rules.sql           ✓ Seed data (4,083 bytes)
│       └── 📄 README.md                           ✓ Instructions
│
└── 📂 public/
```

## Quick Access

### From GitHub Web Interface

1. Go to: `https://github.com/kr4k3n22/atlas`
2. Click folder: `supabase`
3. Click folder: `migrations`
4. You'll see:
   - `001_create_policy_rules_table.sql`
   - `002_seed_policy_rules.sql`
   - `README.md`

### From Local Clone

```bash
# Navigate to repository
cd /path/to/your/atlas

# Go to migrations folder
cd supabase/migrations

# List files
ls -l

# Output:
# 001_create_policy_rules_table.sql
# 002_seed_policy_rules.sql
# README.md
```

### View File Contents

```bash
# View table creation SQL
cat supabase/migrations/001_create_policy_rules_table.sql

# View seed data SQL
cat supabase/migrations/002_seed_policy_rules.sql
```

## File Details

### 001_create_policy_rules_table.sql
- **Size:** 2,047 bytes
- **Purpose:** Creates the `policy_rules` table with proper CHECK constraints
- **Contains:** Table definition, indexes, and comments

### 002_seed_policy_rules.sql
- **Size:** 4,083 bytes
- **Purpose:** Inserts 10 default policy rules
- **Contains:** INSERT statements for fraud detection, harm/rights, evidence checks, etc.

## Absolute Paths

On the build server or in CI/CD:
```
/home/runner/work/atlas/atlas/supabase/migrations/001_create_policy_rules_table.sql
/home/runner/work/atlas/atlas/supabase/migrations/002_seed_policy_rules.sql
```

On your local machine (will vary):
```
/Users/yourname/projects/atlas/supabase/migrations/001_create_policy_rules_table.sql
/home/yourname/projects/atlas/supabase/migrations/001_create_policy_rules_table.sql
C:\Users\yourname\projects\atlas\supabase\migrations\001_create_policy_rules_table.sql
```

## Verification

To confirm the files exist in your repository:

```bash
# From repository root
ls -lh supabase/migrations/

# Expected output:
# -rw-r--r-- 1 user group 2.0K ... 001_create_policy_rules_table.sql
# -rw-r--r-- 1 user group 4.0K ... 002_seed_policy_rules.sql
# -rw-r--r-- 1 user group 2.4K ... README.md
```

## Still Can't Find Them?

If you can't see the files:

1. **Check you're on the correct branch:**
   ```bash
   git branch  # Should show copilot/implement-risk-scoring-policy-rules
   ```

2. **Pull latest changes:**
   ```bash
   git pull origin copilot/implement-risk-scoring-policy-rules
   ```

3. **Clone fresh (if needed):**
   ```bash
   git clone https://github.com/kr4k3n22/atlas.git
   cd atlas
   git checkout copilot/implement-risk-scoring-policy-rules
   ```

4. **Check GitHub directly:**
   Visit: `https://github.com/kr4k3n22/atlas/tree/copilot/implement-risk-scoring-policy-rules/supabase/migrations`

## Next Steps

Once you've located the files:

1. See `QUICK_START.md` for 3-step setup guide
2. Copy SQL contents into Supabase SQL Editor
3. Execute the migrations
4. Verify with `SELECT COUNT(*) FROM policy_rules;`

---

**The files are definitely there!** They were created as part of the Phase 3 & 4 implementation.
