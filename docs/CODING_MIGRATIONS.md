# Coding practice schema migrations

The repository previously had no Prisma migration history. The first migration establishes a baseline for the existing schema; subsequent migrations add execution-mode/test-case configuration, persisted Run results, and Submit-specific terminal states.

## Existing databases

1. Take a verified PostgreSQL backup and confirm `DATABASE_URL` points to the intended database.
2. Confirm its schema matches the existing Prisma schema before this release. Do not use this procedure to baseline an empty or drifted database.
3. Mark the existing-schema baseline as applied; this records history and does not change application tables:

   ```powershell
   npx prisma migrate resolve --applied 20261104180000_existing_schema_baseline
   ```

4. Apply the additive migration:

   ```powershell
   npx prisma migrate deploy
   ```

`prisma migrate deploy` applies the current additive migrations, including `20261104200000_coding_run_test_results` and `20261104203000_coding_submission_verdicts`.

Do not run `prisma migrate reset` against an existing database.

## New databases

Set `DATABASE_URL` to the new, empty PostgreSQL database and run:

```powershell
npx prisma migrate deploy
```

Prisma applies the baseline and then all additive Coding Practice migrations.

The Phase 2 migration defaults existing problems to `STDIN_STDOUT`, test-case weights to `1.00`, and comparison configuration to `TRIM_TRAILING_WHITESPACE`. The Run-results migration adds nullable per-test result storage. The Submit migration only adds enum values for processing/evaluation and final verdict states; it does not rewrite existing rows or add columns. All migrations are additive and preserve existing data.
