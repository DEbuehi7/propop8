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
4. **Authentication → Users → Add user**: your email and a new strong password
   (from your password manager), auto-confirm on. This is the vault's own
   login, separate from your Supabase.com sign-in. (Two-factor on your
   Supabase.com account protects the dashboard; the vault login gets its
   own authenticator in step 7.)
5. **SQL Editor**, run this exactly. It makes the one login from step 4 the
   vault's owner, and refuses if there is not exactly one login, so it can
   never pick the wrong account:

   ```sql
   insert into public.vault_owner (owner_id)
   select id from auth.users where (select count(*) from auth.users) = 1
   on conflict (singleton) do nothing;
   select count(*) as owners from public.vault_owner;
   ```

   `owners` must be `1`. If it shows `0`, run `select count(*) from auth.users;`:
   `0` means step 4 isn't done yet; `2` or more means there are extra logins.
   Delete the ones that aren't you under Authentication → Users, then run step 5 again.
6. **On your Mac**, install the tools (once):

   ```bash
   brew install age ffmpeg qrencode
   ```

   `age` encrypts, `ffmpeg` makes the light audio copies, `qrencode` shows the
   authenticator QR code in Terminal.
7. **Connect this Mac and link your authenticator** (Terminal, in the
   `propop8` folder):

   ```bash
   npx --yes tsx scripts/vault/vault.ts setup
   npx --yes tsx scripts/vault/vault.ts enroll
   npx --yes tsx scripts/vault/vault.ts login
   ```

   - `setup` asks for the vault project's URL (the **Connect** button at the
     top of the project, or Project Settings → Data API) and its
     **publishable** key (Project Settings → API Keys; the older "anon" key
     also works). Nothing shows while you paste the key; that is normal. It
     checks both against the project and saves them on this Mac only. It
     refuses the secret / service-role key.
   - `enroll` asks for the step 4 email and password, then shows a QR code.
     Scan it with your authenticator app; the new entry is named "AIM Vault"
     plus the date and time, so type the code from that entry. Using two apps?
     Scan it with both before typing the 6-digit code. A wrong password or code
     can be retried without starting over. In Microsoft Authenticator choose
     **Add account → Other account (Google, Facebook, etc.)**; the "Work or
     school" option will not read it. If anything goes wrong, just run
     `enroll` again. The QR screen and setup key are secrets: never paste
     them anywhere, and press Cmd+K to clear the screen afterwards.
   - `login` asks for the email, password and a current 6-digit code. You
     stay signed in on this Mac until you run `vault logout`.
   - Lost the phone, want to add another app later, or the key was seen by
     anyone: `npx --yes tsx scripts/vault/vault.ts reset-authenticator`. It
     asks for a code from the current app, removes it, and shows a new QR code.
8. **Make your backup key** (once):

   ```bash
   npx --yes tsx scripts/vault/vault.ts backup-key
   ```

   It puts `aim-vault-backup-key.txt` on your Desktop. Attach that file to your
   password manager, copy it to a USB drive, then delete it from the Desktop.
   Only its public half stays on the Mac, which can lock backups but not
   open them.

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
npx --yes tsx scripts/vault/vault.ts backup --out ~/aim-vault-backups
```

To download a file, copy its ID from `list` and run `vault get` with that ID
and `--out ~/Downloads` (add `--copy preview` for the light copy). `get` verifies every download against its recorded fingerprint, and every
upload, download, export and backup is written to the append-only `access_log`.

## What is deliberately not here yet

- PropOps8 does not read the vault. When it needs to, it gets a read-only view
  of tier 0-1 catalog rows, not the files and not the vault's keys.
- No live AI connection. Pure gets the `export-pure` file you upload yourself.
- Restore from a backup is manual: decrypt the `.tar.age` with `age -d -i` and the
  private key file from your USB drive, then unpack it with `tar -xf`.
