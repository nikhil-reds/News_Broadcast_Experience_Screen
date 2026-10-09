# UI/UX Page Inventory and Fix Plan

Scope: every route under `app/`. Admin pages were read in full. Broadcast screens were reviewed by file (summary pass), so their items need a visual check on the real display before implementation.

Already done: the admin sidebar (`components/admin/admin-sidebar.tsx`) now has active-route tracking, icons, and a red Sign out button at the bottom.

## 0. Status

P0 pass done:
- Shared: `AdminPageHeader` used on all 16 admin pages; `ConfirmSubmitButton` for destructive/state-changing actions; admin `loading.tsx` and `error.tsx`.
- `/admin/ads` and `/admin/ads/[id]`: labelled form, confirm on enable/disable and delete, Delete moved to a "Danger zone", missing-fields error shown.
- `/signin`: labels, `role="alert"` on errors, dead "Forgot password?" link removed, card logo shown only below `lg`.
- `/camera`: recording blocked when session creation fails (error shown); End Recording asks for confirmation; `recorder: any` typed.
- Broadcast layout: intro gate clears on video error or after 6 s if playback never starts.
- `/screen7`: operator-facing jargon replaced; "Stop waiting" button on the loader (the server render keeps running).

Deferred to P1/P2: table mobile layout and filters (§2.3, §2.11), polling consolidation, `/main` video decodes, broadcast screen items in §5, and the `key={pathname}` intro replay on every screen change (left as is; confirm the intended behaviour first).

## 1. Page inventory (33 routes)

### Admin (16) — `app/(admin)/admin/`
| # | Route | File |
|---|---|---|
| 1 | `/admin` | `page.tsx` |
| 2 | `/admin/sessions` | `sessions/page.tsx` |
| 3 | `/admin/sessions/[id]` | `sessions/[id]/page.tsx` |
| 4 | `/admin/screens` | `screens/page.tsx` |
| 5 | `/admin/recordings` | `recordings/page.tsx` |
| 6 | `/admin/audio` | `audio/page.tsx` |
| 7 | `/admin/transcripts` | `transcripts/page.tsx` |
| 8 | `/admin/translations` | `translations/page.tsx` |
| 9 | `/admin/ads` | `ads/page.tsx` |
| 10 | `/admin/ads/[id]` | `ads/[id]/page.tsx` |
| 11 | `/admin/video-jobs` | `video-jobs/page.tsx` |
| 12 | `/admin/video-jobs/[id]` | `video-jobs/[id]/page.tsx` |
| 13 | `/admin/generation-tasks` | `generation-tasks/page.tsx` |
| 14 | `/admin/generation-tasks/[id]` | `generation-tasks/[id]/page.tsx` |
| 15 | `/admin/workers` | `workers/page.tsx` |
| 16 | `/admin/settings` | `settings/page.tsx` |

### Auth (1)
| 17 | `/signin` | `app/(auth)/signin/page.tsx` |

### Studio / control (3)
| 18 | `/` (control room home) | `app/page.tsx` |
| 19 | `/main` (device preview wall) | `app/(main)/main/page.tsx` |
| 20 | `/camera` (multi-camera and audio studio) | `app/(main)/camera/page.tsx` |

### Broadcast screens (13) — `app/(screens)/`
| 21 | `/all` | `all/page.tsx` |
| 22 | `/screen1` | `screen1/page.tsx` |
| 23 | `/screen2` | `screen2/page.tsx` |
| 24 | `/screen3` | `screen3/page.tsx` |
| 25 | `/screen4` | `screen4/page.tsx` |
| 26 | `/screen5` | `screen5/page.tsx` |
| 27 | `/screen6` | `screen6/page.tsx` |
| 28 | `/screen7` | `screen7/page.tsx` |
| 29 | `/screen8` | `screen8/page.tsx` |
| 30 | `/screen9` | `screen9/page.tsx` |
| 31 | `/screen10` | `screen10/page.tsx` |
| 32 | `/screen11` | `screen11/page.tsx` |
| 33 | `/screen12` | `screen12/page.tsx` |

Shared layout for screens: `app/(screens)/layout.tsx`. Admin layout: `app/(admin)/admin/layout.tsx` → `components/admin/admin-shell.tsx`.

## 2. Shared admin foundation (fix once, benefits all 16 admin pages)

Priority P0 — do first.

1. **Page header component.** Extract the repeated `<div><h2/><p/></div>` into `AdminPageHeader` (title, description, optional back link, optional actions slot). Detail pages currently hand-roll the "Back to …" link.
2. **Table empty/loading/error states.** `AdminTable` only shows "No records found." Add loading and error variants. Pages should not show an empty table when the query failed.
3. **Mobile tables.** Tables use `whitespace-nowrap` and `overflow-x-auto`, so on narrow screens they scroll sideways. Add a card layout below `md`, or hide low-priority columns.
4. **Sticky table headers and row density.** Long lists (50–100 rows) lose their headers on scroll.
5. **Truncated text with a full-value reveal.** Several columns (`text`, `errorMessage`, `progressMessage`) use `truncate` with no way to read the full value. Add a `title` attribute or a details drawer.
6. **Status badges.** Colour is the only signal for some statuses, and the map is incomplete (`missing`, `none`, `pending` and `null` values fall through to neutral). Add an icon or dot and a shared status legend.
7. **Consistent action buttons.** Primary, secondary, and destructive buttons are styled differently on each page. Create `AdminButton` with `primary | secondary | danger`.
8. **Confirmations for destructive or state-changing actions.** Delete campaign and disable/enable campaign currently fire with no confirmation. Add a confirm step (dialog or inline "Confirm delete").
9. **Form labels.** The create-campaign form uses placeholders only. Add visible labels and `aria-describedby` hints.
10. **Auto-refresh for live data.** Dashboard, Workers, Generation Tasks and Sessions show data that changes during a run, but only refresh on navigation. Add a refresh control and a "last updated" timestamp. Polling is an option, but the pipeline is already polled elsewhere, so start with manual refresh.
11. **Pagination and filters.** Every list is hard-capped (`take: 50` or `take: 100`) with no paging, search, or status filter. Add status filter chips and "Load more" (or page params) to every list page.
12. **Responsive page top bar.** The navbar shows "Signed in as …" and the mobile horizontal nav is cramped. Revisit once the sidebar change has settled.

## 3. Per-page plan — admin

| Page | Current state | Fix plan | Priority |
|---|---|---|---|
| `/admin` Dashboard | 5 stat cards and two tables. Cards use `xl:grid-cols-5`, which is tight. | Use shared header. Make each card a link to its list page filtered by status. Add a "last updated" stamp. Add an empty state for a fresh install. | P1 |
| `/admin/sessions` | 9 columns with `nowrap`; seq is a link. | Add status/pipeline filters. Trim columns on small screens (keep Seq, Status, Started). Show the session's elapsed duration. | P1 |
| `/admin/sessions/[id]` | Detail grid plus three tables. Recordings table has no link to the file. | Add links to recording and audio assets. Add a "Pipeline summary" card (N done / N failed). Group the page into tabs or anchored sections for long sessions. | P1 |
| `/admin/screens` | Table with no summary. "Open" links go to `/screenN`, which is the live display. | Show a status badge per screen (live / pending / failed). Make the failure reason readable. Label "Open" as "Open screen" and open in a new tab. | P2 |
| `/admin/recordings` | Filename, session, type, size, view link. Filename is not readable on narrow screens. | Add a session filter. Add thumbnails or a preview player. Show a "missing file" state. | P2 |
| `/admin/audio` | Speaker shows "missing" as a status badge, which reads as an error. | Use a neutral "Not analysed" state. Add a play control or preview. Show a human-readable duration. | P2 |
| `/admin/transcripts` | Truncated text with no preview; engine name is unformatted. | Add a transcript preview drawer. Format the language name. Add a language filter. | P2 |
| `/admin/translations` | "Listen" plays TTS; the "missing" state is shown as "None" in one column and "missing" in another. | Make missing states consistent. Add an inline audio player. Group by generation. | P2 |
| `/admin/ads` | Create form is six inputs in a grid with no labels and no validation message. "Disable" and "Enable" are one-click with no confirm. Actions column mixes a link and a form button. | Add labels and inline validation. Put Create in a dialog or collapsible section. Add confirm for toggle. Fix the button hierarchy (Details primary, toggle secondary). Add a "Top campaigns by impressions" sort. | P0 |
| `/admin/ads/[id]` | Detail grid with primary Disable button and red Delete. Delete has no confirm and no undo. | Add a confirm dialog for Delete (type the sponsor name, or a simple confirm). Put Delete in a "Danger zone" section. Show impressions as a trend if data allows. | P0 |
| `/admin/video-jobs` | Output column mixes a link and an error string. | Separate Output and Error columns. Add a progress indicator for in-flight jobs. Add a status filter. | P1 |
| `/admin/video-jobs/[id]` | "Open output" is the only action. | Add a video preview. Add a "Retry" action for failed jobs if the backend supports it. Show errors in the same `<pre>` style as Generation Tasks. | P2 |
| `/admin/generation-tasks` | 8 columns, error message is truncated. | Add a status filter and a "Failed only" toggle. Highlight stale heartbeats. | P1 |
| `/admin/generation-tasks/[id]` | 12-item detail grid and an error block. | Group items: Identity, Progress, Timing, Recovery. Show a timeline of attempts. Add copy buttons for IDs and error text. | P2 |
| `/admin/workers` | Three cards and a table. The "Possibly Stale" card is red when non-zero but does not say what to do. | Link the stale count to a filtered Generation Tasks list. Add a short operator hint. Auto-refresh (see §2.10). | P1 |
| `/admin/settings` | Read-only config with a warning when defaults are in use. Recommended env block is a static code sample. | Add a clear "Action needed" banner when defaults are active. Add a copy button for the env block. Mark secrets as "set" without revealing values. | P2 |

## 4. Sign-in and studio pages

| Page | Issues from review | Fix plan | Priority |
|---|---|---|---|
| `/signin` | Inputs have placeholders only, no `<label>`. Error box has no `role="alert"`. "Forgot password?" is `href="#"`, a dead link. Logo appears twice. No mobile branding. | Add visible labels. Add `role="alert"` to the error. Hide or wire up "Forgot password?". Show the logo once. Add mobile branding. | P0 |
| `/` control room | Header colour is an inline hex style. Camera 2/3 error says "pick it in the list below", but no device list is rendered. Duplicated camera logic with `/camera`. `eslint-disable` on mount effect. | Move colours to tokens. Render the device picker or fix the copy. Extract shared camera hook. | P1 |
| `/main` device wall | 12 simultaneous `<video>` decodes of one source. Fixed pixel widths per card. 10px text. `key={index}`. Fetch failure never shows an error state. | Use one shared source or limit to a few visible previews. Responsive grid. Use stable keys. Add an error state. | P1 |
| `/camera` studio | Emoji used as icon. Session-creation failure is only logged, so recording starts with no session. No elapsed time. Untyped `recorder: any`. One-click End with no confirm. | Surface session errors to the operator and block recording without a session. Show elapsed time and per-take status. Type the handlers. Confirm End Recording. | P0 |

## 5. Broadcast screens (display output)

These pages run on the screens themselves. Check each one on the real display before changing it, because the layouts are tuned for specific sizes.

Cross-cutting items to fix once:

- **Layout failure.** `app/(screens)/layout.tsx` only reveals the screen on the intro video's `onEnded`. If the video errors, the wall stays black. Add an `onError` fallback and a timeout. Also avoid replaying the intro on every screen change (`key={pathname}`).
- **Polling.** `/api/save-audio`, `/api/save-recording` and transcript endpoints are polled every 3–5 s from many screens with no backoff. Centralize into one hook with backoff.
- **Duplicated logic.** WebSocket connect, reconnect, and version guard are copied across screens 5, 6 and 7. Brightness and audio-language selection are copied across 6, 11 and 12. Extract shared hooks.
- **Duplicated language list.** Screens 5, 7 and 8 each keep their own copy. Move to one module.
- **Hard-coded values.** `ws://host:3001`, `/bg-video/1.1.mp4`, language lists and ad image paths. Move to config.
- **Styling.** Inline style objects and `clamp()`/vh values are used on most screens. Move to CSS tokens or modules.
- **Accessibility.** Few visible focus states, colour-only status, and few meaningful `aria-live` regions. Fix focus rings, add text status, and limit live regions to changes that matter.
- **Feedback.** Many failures are silent (`catch {}`). Add operator-readable empty, loading and error states.

| Page | Issues from review | Fix plan | Priority |
|---|---|---|---|
| `/all` | Renders `AllScreensWall`. Not reviewed in depth. | Review the wall component separately. | P2 |
| `/screen1`, `/screen2`, `/screen3` | Full-viewport camera loop. No camera label. Black until the first recording exists. | Add a small camera label. Add an empty-state message. Share the polling hook. | P1 |
| `/screen4` teleprompter | About 260 lines of inline `<style>` with hard-coded px/vh. `aria-live` on a line that changes every few seconds. Low-contrast "Waiting" text. Small Start button. | Move CSS to a module. Limit `aria-live` to the broadcast title. Raise contrast. Enlarge Start Broadcast. | P1 |
| `/screen5` language wheel | Keyboard-only; no on-screen controls or touch. Hard-coded `:3001` fallback. Silent `catch {}`. Pending translations look like normal items. | Add on-screen controls for touch. Explain pending items. Use the shared WebSocket hook. | P1 |
| `/screen6` brightness | Keyboard hint not visible. Sr-only label. `text-slate-700` on dark panel (low contrast). Tiny status text. | Visible keyboard hint. Raise contrast. Enlarge status text. | P2 |
| `/screen7` background picker | About 860 lines with overlapping poll and retry loops. Developer jargon in operator errors ("ffmpeg", "RVM matte", "npm run worker:green-screen"). Colour-only status dots. Blocking loader with no cancel. | Split into smaller components and one poll loop. Replace jargon with operator text. Add text status and `aria-pressed` on thumbnails. Make loader cancellable. | P0 |
| `/screen8` subtitle language | Third copy of language list. `<h1>` inside a component. Tiny top status line. Hard-coded "record all 3 cameras" copy. Inclusive cue bounds (`<=`) can overlap adjacent cues. | Use shared language list. Fix heading level. Move status into a visible panel. Use half-open cue bounds `[start, end)`. | P1 |
| `/screen9` industry grid | Arrow keys wrap across rows (ambiguous). Hover-only emphasis. Long names clip in fixed tiles. Hard-coded hex. Duplicated ring/gradient styles. | Make arrows move within rows. Add focus styling. Allow word wrap. Use tokens. | P1 |
| `/screen10` brand grid | Capped at 4 columns, so 5–6 brands leave a partial last row. Hard-coded logo sizes. Same style duplication as screen 9. No visible keyboard hint. | Responsive column count that centres partial rows. Use responsive image sizes. Share tile component with screen 9. | P1 |
| `/screen11` ad playout | No cue separating ad from programme. `object-fill` distorts the ad image. Hard-coded L-band crop. Depends on a possibly missing Tailwind plugin (`animate-in`). No manual control. | Add an "Advertisement" label. Use `object-contain`. Move crop values to config. Verify plugin or remove. | P1 |
| `/screen12` fixed rotation | Hard-coded ad paths with encoded spaces. Broken frame if an image is missing. Overlay says "Click to enable original audio", which is misleading because the track is embedded. Whole frame is the click target. | Move scenes to data. Fallback image. Correct the overlay text. Use a dedicated audio-enable button. | P1 |

## 6. Suggested order

1. **P0 (before anything else):** shared foundation items §2.1, §2.2, §2.8; `/signin` labels and errors; `/camera` session error and End confirm; `/admin/ads` and `/admin/ads/[id]` confirmations and labels; `/screen7` operator text and loader cancel; layout video fallback in `app/(screens)/layout.tsx`.
2. **P1:** table mobile layout and status/filter work (§2.3, §2.11); the remaining admin list pages; polling consolidation; broadcast screens 4, 5, 8–12.
3. **P2:** detail-page refinements, settings, and the remaining screen polish.

## 7. Verification

- Each admin page: load at 375px, 768px and 1280px widths and check for horizontal scroll.
- Keyboard-only pass for sign-in, admin forms and the sidebar.
- Broadcast screens: check on the real display resolution, since the layouts are tuned to it.
- Run `npx tsc --noEmit` and `npx eslint` after each batch.
