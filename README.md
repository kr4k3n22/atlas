This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 🚀 Quick Start

### Database Setup (Required First!)

This project requires Supabase for database functionality. **Migration files are included in this repository.**

📂 **SQL Migration Files Location:** `supabase/migrations/`
- `001_create_policy_rules_table.sql` - Creates policy_rules table
- `002_seed_policy_rules.sql` - Seeds initial policy data

📖 **Setup Guides:**
- **Quick Start:** See [`QUICK_START.md`](QUICK_START.md) for 3-step database setup
- **File Locations:** See [`FILE_LOCATIONS.md`](FILE_LOCATIONS.md) if you can't find the SQL files
- **Schema Details:** See [`SUPABASE_TABLES.md`](SUPABASE_TABLES.md) for complete schema documentation

### Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## 📚 Documentation

- [`QUICK_START.md`](QUICK_START.md) - Fast database setup (start here!)
- [`FILE_LOCATIONS.md`](FILE_LOCATIONS.md) - Where to find SQL migration files
- [`SUPABASE_TABLES.md`](SUPABASE_TABLES.md) - Complete database schema documentation
- [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) - Common issues and solutions
- [`SQL_CHECK_CONSTRAINT_RESOLUTION.md`](SQL_CHECK_CONSTRAINT_RESOLUTION.md) - SQL syntax help

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
