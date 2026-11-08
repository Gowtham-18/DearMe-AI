# Backup and recovery plan

**Goal:** if the database is lost, corrupted or wrongly changed, we can bring journals back with at most
one day of loss (RPO 24 hours), within two hours (RTO 2 hours), without backups ever becoming a way to
read people's journals.

## What we back up

| Data | Where it lives | Backed up by |
|---|---|---|
| Accounts (`auth` schema: emails, password hashes, identities) | Supabase Postgres | Nightly job below |
| Journals, insights, memories, settings (`public` schema) | Supabase Postgres | Nightly job below |
| Code, migrations (`docs/db/*.sql`) | GitHub | Git itself |
| Secrets (Supabase keys, NLP token, LLM key) | Vercel, Render, password manager | Owner's password manager |
| NLP models | Downloaded at build time | Rebuilt on deploy |

Locked journals (journal lock) stay encrypted inside the backup, because they're encrypted before they reach
the database. A backup can't unlock them; only the user's passphrase or recovery code can.

## Layer 1: nightly encrypted dump (free, in place now)

`.github/workflows/backup.yml` runs every night at 02:00 India time:

1. `pg_dump` (version 17) dumps the `public` and `auth` schemas.
2. The dump streams straight into [age](https://age-encryption.org), encrypted to the owner's public key.
   Nothing unencrypted is written to disk.
3. The encrypted file is kept as a workflow artifact for **14 days**, then deleted automatically.
4. The job fails loudly (red X and an email from GitHub) if the dump is missing or suspiciously small.

The repository is public, so assume anyone could download the encrypted file. That's why the private key
never goes near GitHub: without it, the file is unreadable.

### One-time setup (owner, about 10 minutes)

1. Install age on your own computer (`winget install FiloSottile.age`, `brew install age` or your package
   manager).
2. Make a key pair: `age-keygen -o dearme-backup-key.txt`. It prints the public key (`age1...`).
3. Store `dearme-backup-key.txt` in your password manager **and** on an offline USB stick. If it's lost,
   the backups can't be opened.
4. In Supabase: **Project Settings → Database → Connection string → URI**, choose **Session pooler**, and
   copy it with the database password filled in.
5. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL`: the connection string from step 4.
   - `BACKUP_AGE_RECIPIENT`: the public key from step 2 (`age1...`).
6. Run it once: **Actions → Nightly encrypted backup → Run workflow**, and check it goes green.

## Layer 2: Supabase Pro (recommended before a wider launch)

The free plan has no backups we can restore from. Supabase Pro (about $25/month) adds daily backups kept
for 7 days with one-click restore, and point-in-time recovery as an add-on (restore to any second). Keep
Layer 1 running as well: it's an independent copy outside Supabase.

## Restoring

Practise this every month on a throwaway database, so the steps are known to work when they matter.

1. Download the latest `dearme-backup` artifact from **Actions** and unzip it.
2. Decrypt and restore into an **empty** Postgres 17 database (a new Supabase project, or a local one):

   ```sh
   age --decrypt --identity dearme-backup-key.txt dearme-<date>.dump.age \
     | pg_restore --no-owner --no-privileges --dbname "$TARGET_DB_URL"
   ```

   For a new Supabase project, restore only `public` (`--schema=public`) and recreate accounts through
   Supabase's auth import, or restore both schemas into a fresh project before anyone signs in.
3. Re-apply the RLS migrations if anything is missing (`docs/db/schema-phase*.sql` are safe to re-run),
   then run `node scripts/test-migrations.mjs` against a copy to confirm the policies hold.
4. Point the app at the restored project (Vercel and Render environment variables), redeploy, and sign in
   with a test account to check entries, insights and memories load.
5. Delete the decrypted copy and the local download when finished.

## Deletion and retention

- When someone deletes their data or account, it leaves the live database at once.
- Copies in Layer 1 expire after 14 days, and in Supabase Pro backups after 7 days, so deleted data is
  gone from every backup within 30 days. The privacy notice promises this; don't raise retention without
  updating it.
- Don't restore a backup over live data without checking for accounts deleted since the backup was taken,
  and delete those again after restoring.

## Who can do what

| Task | Who |
|---|---|
| Hold the backup private key | Owner only (password manager plus offline copy) |
| Change backup secrets in GitHub | Repository admins |
| Restore production | Owner, with a second person checking where possible |

Turn on two-factor authentication for GitHub, Supabase, Vercel and Render: anyone with those accounts can
reach the data or the backups.
