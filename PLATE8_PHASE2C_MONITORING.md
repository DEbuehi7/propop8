# Phase 2C: Supabase Read Prioritization & Monitoring

## Overview

Phase 2C switches the API read strategy to **Supabase-first** while keeping the in-memory Map as a fallback. All reads are monitored to track adoption, performance, and error rates.

**Goal:** Achieve 95%+ Supabase read adoption within 1 week. Then proceed to Phase 3 (remove Map).

---

## What Changed

### Read Strategy

**Before (Phase 2B - Dual-Write):**
```
Write: Map + Supabase
Read:  Try Supabase → Fallback to Map
```

**Now (Phase 2C - Supabase-First):**
```
Write: Map + Supabase (same)
Read:  Try Supabase → Fallback to Map (same)
       But now we MEASURE every read
```

The logic is the same, but every read operation is now logged with:
- Which backend served it (Supabase or Map)
- Latency in milliseconds
- Success/failure status
- Whether fallback was used

### Monitoring Coverage

All session read operations are instrumented:

1. **GET /api/plate8/state8/session** — List recent sessions
2. **POST /api/plate8/state8/session (action: 'get')** — Get specific session
3. **POST /api/plate8/state8/session (action: 'list')** — List sessions (paginated)

---

## Monitoring Dashboard

### Access

Visit: **http://localhost:3000/plate8/monitoring**

The dashboard auto-refreshes every 5 seconds with live metrics.

### Metrics Displayed

#### Key Stats (Top Row)
- **Total Reads** — Cumulative read requests since server start
- **Supabase Reads** — Requests served from Supabase
- **Fallbacks** — Times Map was used because Supabase failed/returned empty
- **Errors** — Failed read requests (both sources)

#### Health Indicators
- **Read Source Distribution** — Pie chart of Supabase vs Map
- **Average Latency** — Mean response time across all reads
- **Supabase Success Rate** — % of Supabase queries that succeeded
- **Map Success Rate** — % of Map queries that succeeded

#### Insight Message
Automated assessment of migration health:
- ✅ `>95%` → "Supabase adoption healthy"
- ⚠️ `70-95%` → "Moderate adoption, monitor closely"
- 🔴 `<70%` → "Low adoption, investigate errors"

#### Recent Errors
If any failures occurred, the 5 most recent are displayed with:
- Error message from Supabase
- Query type (get / list)
- Latency

---

## API Endpoints

### 1. Get Current Snapshot
```bash
GET /api/plate8/state8/monitoring?action=snapshot
```

**Response:**
```json
{
  "timestamp": "2026-10-05T16:00:00Z",
  "metrics": {
    "totalReads": 156,
    "supabaseReads": 145,
    "mapReads": 11,
    "fallbackCount": 11,
    "avgLatencyMs": 42,
    "errorCount": 2,
    "supbaseSuccessRate": 98,
    "mapSuccessRate": 100
  },
  "distribution": {
    "supabase": 93,
    "map": 7
  },
  "insight": "✅ Supabase adoption healthy (>95%)"
}
```

### 2. Get Recent Errors
```bash
GET /api/plate8/state8/monitoring?action=errors&limit=10
```

**Response:**
```json
{
  "timestamp": "2026-10-05T16:00:00Z",
  "errorCount": 2,
  "recentErrors": [
    {
      "timestamp": 1728143400000,
      "action": "list",
      "source": "supabase",
      "latencyMs": 245,
      "success": false,
      "errorMessage": "connection timeout",
      "fallbackUsed": false
    }
  ]
}
```

### 3. Reset Metrics
```bash
GET /api/plate8/state8/monitoring?action=reset
```

Clears all recorded metrics. Use after deployment to start fresh.

---

## Monitoring During Phase 2C

### Daily Check-In

1. **Morning** — Visit dashboard, note Supabase adoption %
2. **After Testing** — Run a few test sessions, check latency
3. **Evening** — Review error log, investigate any spikes

### Expected Timeline

| Time | Supabase % | Status |
|------|-----------|--------|
| Hour 1 | 80-90% | Initial adoption, some Map fallbacks |
| Day 1 | 92-95% | Stabilizing |
| Day 3 | 95%+ | Healthy |
| Day 7 | 98%+ | Ready for Phase 3 |

### Red Flags

Stop and investigate if:
- **Supabase adoption drops below 70%** → Connection issues, likely Supabase down
- **Error rate climbs above 5%** → Data inconsistency, schema mismatch
- **Latency spikes above 200ms** → Network lag or database load
- **Consistent Map fallbacks** → Supabase not persisting writes correctly

---

## Troubleshooting

### "Supabase adoption stuck at 0%"

**Cause:** Supabase client not initialized or credentials wrong.

**Fix:**
1. Check `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Verify schema migration ran (check Supabase Table Editor for `sessions` table)
3. Restart `npm run dev`

### "High fallback rate (>30%)"

**Cause:** Supabase queries returning empty while Map has data.

**Likely:** Supabase has no data yet (new deployment).

**Fix:**
1. Record a few test sessions (State8)
2. Check Supabase Table Editor — do sessions appear?
3. If yes, it's a query issue. If no, dual-write failed.

### "Error rate climbing"

**Cause:** Network issues, Supabase down, or schema mismatch.

**Fix:**
1. Check Supabase status at https://status.supabase.com
2. Review error details on dashboard
3. Verify schema migration is complete and RLS policies are enabled

---

## Phase 2C Success Criteria

✅ **Ready for Phase 3 when:**
- [ ] Supabase adoption ≥95% for 48+ hours
- [ ] No errors or <1% error rate
- [ ] Average latency <100ms
- [ ] All recent sessions in Supabase Table Editor

---

## Next: Phase 3

Once Phase 2C is stable for 1 week:

1. **Remove Map storage** from `app/api/plate8/state8/session.ts`
2. **Update API** to use only Supabase reads
3. **Keep monitoring** for 1 more week
4. **Start WebSocket work** for real-time streaming (Phase 3)

---

## Code Structure

### Files Added/Modified

- **lib/sessionMonitoring.ts** — In-memory metrics buffer and query functions
- **app/api/plate8/state8/monitoring.ts** — Metrics API endpoint
- **app/plate8/monitoring/page.tsx** — Real-time monitoring dashboard
- **app/api/plate8/state8/session.ts** — Updated with monitoring calls

### Recording a Read

Every read operation records metrics:

```typescript
import { recordRead } from '@/lib/sessionMonitoring';

recordRead({
  action: 'get',              // 'get' or 'list'
  source: 'supabase',         // 'supabase' or 'map'
  latencyMs: 42,              // Measured time
  success: true,              // true/false
  errorMessage: undefined,    // Error details if !success
  fallbackUsed: false,        // true if Map was fallback
});
```

---

## Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Supabase Adoption | 95%+ | 70%+ |
| Latency (p50) | <50ms | <100ms |
| Success Rate | 99%+ | 95%+ |
| Fallback Rate | <5% | <10% |

---

## Questions?

Refer to:
- Architecture doc: Database schema and API specs
- Phase 2B setup guide: How Supabase was configured
- This guide: Monitoring and Phase 2C specifics

**Phase 2C Target:** 1 week of stable, monitored Supabase reads → Phase 3 WebSocket.
