# Background Processing Optimization - Quick Reference

## Problem → Solution

```
OLD: User clicks background → 2-3 min wait → Background appears
NEW: Video exports → Auto-queue 5 BGs → User clicks → Instant!
```

---

## Files Changed/Added

| File | Status | Size | Purpose |
|------|--------|------|---------|
| `lib/queue.ts` | ✏️ Modified | +26 lines | Queue concurrency + auto-enqueue function |
| `app/worker/video-export.ts` | ✏️ Modified | +20 lines | Call auto-enqueue after export |
| `app/api/green-screen/status/route.ts` | ✨ NEW | 65 lines | API to check background status |
| `lib/background-status-poller.ts` | ✨ NEW | 150 lines | Polling utilities for React |
| `SCREEN07_INTEGRATION_EXAMPLE.md` | 📖 NEW | Guide | How to update Screen 07 UI |
| `IMPLEMENTATION_GUIDE_BG_OPTIMIZATION.md` | 📖 NEW | Guide | Complete technical docs |
| `OPTIMIZATION_SUMMARY.md` | 📖 NEW | Guide | Business & technical summary |

---

## Key Code Changes

### 1. Queue Configuration
```typescript
// lib/queue.ts
const BG_QUEUE_CONCURRENCY = parseInt(process.env.BG_QUEUE_CONCURRENCY || "5", 10);
greenScreenQueue.setDefaultSettings({ concurrency: BG_QUEUE_CONCURRENCY });

// New function
export async function enqueueAllBackgroundsForSource(sourceFilename: string) {
  // Queues all 5 backgrounds in parallel
}
```

### 2. Video Export Worker
```typescript
// app/worker/video-export.ts
// After export succeeds:
try {
  await enqueueAllBackgroundsForSource(reelFilename);
} catch (bgErr) {
  // Warning only - export still succeeds
}
```

### 3. Status API
```typescript
// GET /api/green-screen/status?sourceFilename=reel.mp4
// Returns:
{
  backgroundsStatus: [
    { backgroundId: "newsroom-blue", status: "completed", progress: 100 },
    { backgroundId: "city-skyline", status: "processing", progress: 65 },
    // ... 3 more backgrounds
  ],
  allReady: false,
  readyCount: 1
}
```

### 4. Screen 07 Integration
```typescript
import { createBackgroundStatusPoller } from "@/lib/background-status-poller";

const poller = createBackgroundStatusPoller({
  sourceFilename,
  onStatusUpdate: (response) => {
    // Update UI with new statuses
  },
  pollInterval: 2000,
});

poller.startPolling();
// Show status indicators in UI...
```

---

## Timeline: Before vs After

| Time | OLD FLOW | NEW FLOW |
|------|----------|----------|
| T+0s | FFmpeg finishes | FFmpeg finishes |
| T+0-30s | User waits (nothing happens) | BG jobs auto-queued, rendering in parallel |
| T+30s | User clicks BG swatch | User clicks BG swatch |
| T+30-180s | **WAIT** FFmpeg processing | ✅ Already rendered in cache |
| T+180s | Finally appears | Already done! |

**Time saved: ~150 seconds per interaction** ⚡

---

## Worker Startup

```bash
# Terminal 1: Video export worker (needed for auto-queueing)
npm run worker:video-export

# Terminal 2: Green-screen worker (processes background jobs)
npm run worker:green-screen

# Or all workers at once:
npm run worker:all
```

---

## Testing Checklist

- [ ] Video export completes successfully
- [ ] Check Redis: `redis-cli KEYS "*greenscreen*"` → See 5 jobs
- [ ] Call API: `curl http://localhost:3000/api/green-screen/status?sourceFilename=test.mp4`
- [ ] Response shows 5 backgrounds with different states
- [ ] Background worker processes jobs in parallel (check logs)
- [ ] At least 1 BG finishes before user clicks Screen 07
- [ ] Clicking BG swatch shows instant result (or progress bar)
- [ ] Failed BG shows error state with retry option

---

## Environment Variables

```bash
# .env.local or .env.production

# Number of parallel FFmpeg processes for backgrounds
# Default: 5 (one per background)
# Increase with caution - can overload system
BG_QUEUE_CONCURRENCY=5
```

---

## API Endpoints

### Status Check
```
GET /api/green-screen/status?sourceFilename=reel-2026-08-19.mp4

Response: { backgroundsStatus[], allReady, readyCount }
```

### Apply Background (existing, unchanged)
```
POST /api/green-screen/compose

Body: { backgroundId, sourceFilename }
Response: { job }
```

---

## Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| User wait time | 180s | ~2s (or instant) |
| CPU during rendering | Idle → Spike | Steady utilization |
| Storage (MinIO) | +1 BG file | +5 BG files |
| Backwards compat | N/A | ✅ 100% compatible |

---

## Logs to Monitor

```
[video-export-worker] job X done → /...
[video-export-worker] Enqueued 5/5 background composition jobs  ← SUCCESS
[green-screen-compose-worker] job Y → compositing onto "newsroom-blue"
[green-screen-compose-worker] job Z → compositing onto "city-skyline"
[green-screen-compose-worker] ✅ completed job Y
[green-screen-compose-worker] ✅ completed job Z
```

All 5 jobs should appear almost simultaneously and complete in parallel.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| BG jobs not queuing | Check `npm run worker:video-export` is running |
| Status API returns 400 | Add `sourceFilename` query param |
| Backgrounds still slow | Increase `BG_QUEUE_CONCURRENCY` (if hardware allows) |
| Jobs failing silently | Check MinIO connectivity, background image paths |
| Too many jobs queued | Reduce `BG_QUEUE_CONCURRENCY` (system overloaded) |

---

## Rollback Plan

If issues arise:

```typescript
// Simply remove this from app/worker/video-export.ts:
await enqueueAllBackgroundsForSource(reelFilename);

// Users get old behavior (on-demand, 2-3 min wait)
// No data loss, no database rollback needed
```

---

## Next Steps

1. **Deploy code changes** (lib/queue.ts, worker, new API)
2. **Start workers** (video-export + green-screen)
3. **Update Screen 07** (add status polling + indicators)
4. **Test with real videos**
5. **Monitor logs** for parallel processing
6. **Adjust polling** if needed (default 2000ms is good)

---

## Success Criteria

✅ Background jobs auto-queue after video export  
✅ All 5 backgrounds render in parallel (not sequential)  
✅ Status API returns accurate job states  
✅ Screen 07 shows progress indicators  
✅ User can interact instantly (or sees progress)  
✅ At least 80% of backgrounds ready by the time user needs them  

---

## Questions?

Refer to:
- `IMPLEMENTATION_GUIDE_BG_OPTIMIZATION.md` - Full technical docs
- `SCREEN07_INTEGRATION_EXAMPLE.md` - React component examples
- `OPTIMIZATION_SUMMARY.md` - Business perspective

Good to go! 🚀
