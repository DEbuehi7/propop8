# AIM Vault

Private, owner-only storage for AIM LLC, SBI Inc and Aura8 Inc documents:
filings, protection/IP, plans, images, audio, datasets, schedules.

- **Own Supabase project.** Never the PropOps8 project, never its keys.
- **Only you.** One owner (`vault_owner`), every table and file needs your
  login **plus** your authenticator code in the same session (`aal2`).
  Anonymous visitors and any other account get nothing. Tested in
  `tests/vault.test.ts` against a real Postgres.
- **No master key in use.** The tool signs in as you and refuses secret /
  service-role keys, so every rule applies to it too.
- **Tiers.** 0 shareable · 1 internal · 2 confidential · 3 restricted.
  Tier 3 (formation documents, EIN letter, IDs, IP filings) must be
  encrypted on your Mac with `age` before upload, and never gets preview copies.
- **Originals never change.** Images also get a WebP copy (your 46 archive
  images: 181 MB → 16 MB) and lossless audio an AAC listening copy.
  The same original is stored only once (fingerprint check).
- **Separate folders per company**: `vault-aim-llc`, `vault-sbi-inc`,
  `vault-aura8-inc`, all private.

## One-time setup (about 20 minutes)

1. **Supabase dashboard → your organization → New project** named `aim-vault`.
   Put the database password in your password manager.
2. **SQL Editor → New query**: paste all of `vault/supabase/001_vault.sql` and Run.
3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up".
   Check that Multi-Factor (TOTP / authenticator app) is enabled.
4. **Authentication → Users → Add user**: your email and a strong password
   (from your password manager), auto-confirm on.
5. **SQL Editor**, run this exactly (it only works while you are the single user):

   ```sql
   insert into public.vault_owner (owner_id)
   select id from auth.users where (select count(*) from auth.users) = 1
   on conflict (singleton) do nothing;
   select count(*) as owners from public.vault_owner;
   ```

   `owners` must be `1`.
6. **On your Mac** (Terminal, in the `propop8` folder):

   ```bash
   brew install age ffmpeg
   read -r -p "Vault project URL: " VAULT_SUPABASE_URL; export VAULT_SUPABASE_URL
   read -s -r -p "Vault publishable (anon) key: " VAULT_SUPABASE_ANON_KEY; export VAULT_SUPABASE_ANON_KEY; echo
   npx --yes tsx scripts/vault/vault.ts enroll
   npx --yes tsx scripts/vault/vault.ts login
   ```

   The URL and the publishable key are under Project Settings → API. Never
   the secret / service-role key; the tool refuses it.
7. **Make your backup key** (once) and keep the file somewhere other than the Mac's
   main disk (USB drive + password manager attachment):

   ```bash
   age-keygen -o ~/aim-vault-backup-key.txt
   ```

## Everyday use

```bash
# file a document (tier 2 = confidential)
npx --yes tsx scripts/vault/vault.ts add ~/Documents/AIM_Operating_Agreement.pdf --entity aim-llc --category governance --title "Operating Agreement" --tier 2 --doc-date 2024-02-15 --tags formation

# restricted: encrypt first (you will be asked for a passphrase), then file the .age
age -p -o ~/Documents/SBI_EIN_Letter.pdf.age ~/Documents/SBI_EIN_Letter.pdf
npx --yes tsx scripts/vault/vault.ts add ~/Documents/SBI_EIN_Letter.pdf.age --entity sbi-inc --category tax --title "EIN confirmation letter" --tier 3

# find and sort (each line starts with the item's ID)
npx --yes tsx scripts/vault/vault.ts list --entity sbi-inc --sort doc_date
npx --yes tsx scripts/vault/vault.ts list --q "operating agreement"

# deadlines
npx --yes tsx scripts/vault/vault.ts deadline add --entity aim-llc --title "Statement of Information" --due 2027-03-31 --repeat biennial
npx --yes tsx scripts/vault/vault.ts deadlines --days 120

# Pure AI: shareable (tier 0-1) titles and open deadlines only, then upload the file to the Pure project
npx --yes tsx scripts/vault/vault.ts export-pure --out ~/Desktop/vault_catalog.md

# weekly encrypted backup; then copy the new .tar.age file to your USB drive or a second cloud
npx --yes tsx scripts/vault/vault.ts backup --out ~/aim-vault-backups --recipient "$(grep -o 'age1[0-9a-z]*' ~/aim-vault-backup-key.txt | head -1)"
```

To download a file, copy its ID from `list` and run `vault get` with that ID
and `--out ~/Downloads` (add `--copy preview` for the light copy). `get` verifies every download against its recorded fingerprint, and every
upload, download, export and backup is written to the append-only `access_log`.

## What is deliberately not here yet

- PropOps8 does not read the vault. When it needs to, it gets a read-only view
  of tier 0-1 catalog rows, not the files and not the vault's keys.
- No live AI connection. Pure gets the `export-pure` file you upload yourself.
- Restore from a backup is manual (`age -d -i KEYFILE backup.tar.age | tar -xf -`).
