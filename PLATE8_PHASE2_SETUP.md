# Plate8 Phase 2: Supabase Migration Setup

This guide walks through setting up Supabase and completing the dual-write migration from in-memory storage to persistent PostgreSQL database.

## Prerequisites

- Supabase account (create at https://supabase.com)
- Node.js 18+ installed locally
- .env.local configured with Supabase credentials

## Step 1: Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New project"
3. Choose a project name (e.g., "plate8-dev")
4. Set a strong database password
5. Wait for the project to initialize (2-3 minutes)

## Step 2: Get Your Credentials

1. In Supabase Dashboard, go to **Settings → API**
2. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Service role key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ Keep this secret!)

3. Create `.env.local` from the template:
```bash
cp .env.local.example .env.local
```

4. Paste your credentials into `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 3: Apply Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Click "New query"
3. Open `/migrations/001_init_schema.sql`
4. Copy the entire SQL content
5. Paste into Supabase SQL Editor
6. Click "Run" (or Ctrl+Enter)

You should see 6 tables created:
- `users`
- `sessions`
- `session_analytics`
- `spectrum_samples`
- `session_files`
- `instrument_state`

Verify by going to **Table Editor** and checking each table exists.

## Step 4: Test the Dual-Write Strategy

The session API is now configured with Phase 1 (dual-write):
- New sessions write to **both** in-memory Map and Supabase
- Reads try Supabase first, fallback to Map if not found

### Local Testing

1. Start the dev server:
```bash
npm run dev
```

2. Visit http://localhost:3000/plate8/state8 (State8 recording page)

3. Create a test session:
   - Click "Start Recording"
   - Speak or play audio for 5 seconds
   - Click "Stop Recording"

4. Verify in Supabase:
   - Go to Supabase **Table Editor**
   - Open the `sessions` table
   - You should see a new row with your session data

### API Testing

Test the session endpoints:

```bash
# Save a session
curl -X POST http://localhost:3000/api/plate8/state8/session \
  -H "Content-Type: application/json" \
  -d '{
    "action": "save",
    "session": {
      "duration": 30,
      "avgFrequency": 440,
      "peakFrequency": 880,
      "transcriptionAccuracy": 0.95,
      "wordsTranscribed": 15
    }
  }'

# List sessions
curl http://localhost:3000/api/plate8/state8/session

# Get specific session
curl -X POST http://localhost:3000/api/plate8/state8/session \
  -H "Content-Type: application/json" \
  -d '{
    "action": "get",
    "sessionId": "YOUR_SESSION_ID"
  }'
```

## Step 5: Backfill Existing Sessions (if any)

If you have existing sessions in the in-memory Map from before migration:

1. Create a temporary migration script:
```bash
# lib/backfillScript.ts
import { backfillSessionsToSupabase } from './supabaseMigration';

// Get all sessions from Map (you'd export this from session.ts)
const legacySessions = Array.from(sessions.values());

// Backfill to Supabase
const result = await backfillSessionsToSupabase(legacySessions);
console.log(result);
```

2. Run verification:
```bash
import { verifyBackfill } from './supabaseMigration';
await verifyBackfill(legacySessions.length);
```

For now (Phase 1), this is not required since new sessions are dual-written.

## Step 6: Enable Row-Level Security (RLS)

The migration script already enables RLS on all tables. Verify:

1. In Supabase, go to **Authentication → Policies**
2. You should see policies for each table:
   - "Users can view own data"
   - "Users can view own sessions"
   - etc.

### Important: RLS prevents data leaks

With RLS enabled:
- ✅ Users can only access their own data (auth_id matches)
- ✅ Anonymous users get sandboxed data
- ❌ Without valid auth token, Supabase returns 403

**For testing**, queries without a JWT token will be blocked. Options:
1. Use server-side API (supabaseAdmin bypasses RLS)
2. Implement auth first (see Step 7)
3. Temporarily disable RLS for testing (not recommended for production)

## Step 7: (Optional) Implement Supabase Auth

For full multi-user support:

1. Create a new hook `hooks/useAuth.ts`:
```typescript
'use client';
import { supabase, signInWithEmail, signUpWithEmail, signOut } from '@/lib/supabaseClient';

export function useAuth() {
  // Auth state management
}
```

2. Add auth pages:
   - `app/auth/login/page.tsx`
   - `app/auth/signup/page.tsx`

3. Protect API routes with JWT validation

This is documented in the main architecture doc.

## Step 8: Monitor and Debug

### Check Supabase Logs
- Go to **Logs** in Supabase Dashboard
- Watch for SQL errors during sessions

### Common Issues

**Issue: "Table 'public.sessions' does not exist"**
- Solution: Check that Step 3 (Apply Schema) completed successfully

**Issue: "Row Level Security (RLS) policy violation"**
- Solution: Make sure you're using `supabaseAdmin` (service role) for writes, not the anon key

**Issue: Sessions not appearing in Supabase**
- Check browser console for errors
- Verify `.env.local` credentials are correct
- Check that `npm run dev` is running and picked up the .env changes

### Useful Queries

Run these in Supabase SQL Editor:

```sql
-- Check session count
SELECT COUNT(*) FROM sessions;

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'sessions';

-- Debug query performance
EXPLAIN ANALYZE SELECT * FROM sessions WHERE user_id = 'abc' ORDER BY created_at DESC;
```

## Next: Phase 2 (When Ready)

When enough sessions are in Supabase and working reliably:

1. **Switch reads to Supabase-first** in `app/api/plate8/state8/session.ts`
   - Reorder: Try Supabase first, fallback to Map
   - Monitor for 1 week for errors

2. **Implement WebSocket real-time** (Phase 3 in architecture doc)
   - Live spectrum streaming
   - Presence system
   - Multi-user session sync

3. **Add analytics pipeline** (Phase 3)
   - Post-session insights generation
   - Dashboard queries
   - Export functionality

## Troubleshooting Checklist

- [ ] Supabase project created
- [ ] Credentials in `.env.local`
- [ ] Schema migration ran (6 tables visible)
- [ ] RLS policies in place
- [ ] Test session appears in Supabase Table Editor
- [ ] API calls return data from Supabase
- [ ] No 403 errors in browser console

## Support

See the architecture document for detailed API specs and data models:
- `/tmp/claude-0/-home-claude-propop8/323d19e3-07b4-52d3-8f35-f6e8d8100bba/scratchpad/plate8_architecture.md`

Questions? Review the migration phases in the architecture doc (lines 475-500).
