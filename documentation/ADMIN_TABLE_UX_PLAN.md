# Admin Table UX Plan

## Objective

Create a consistent, polished data-table experience across every admin page. Each table should be easy to scan, useful with large datasets, responsive at smaller widths, and capable of exposing complete record details without making the main table excessively dense.

## Pages in scope

Apply the shared table system to:

- `/admin` dashboard tables
- `/admin/sessions`
- `/admin/sessions/[id]`
- `/admin/recordings`
- `/admin/transcripts`
- `/admin/translations`
- `/admin/generation-tasks`
- `/admin/generation-tasks/[id]`
- `/admin/video-jobs`
- `/admin/video-jobs/[id]`
- `/admin/ads`
- `/admin/ads/[id]`
- `/admin/audio`
- `/admin/screens`
- `/admin/workers`

Detail pages should use the same visual language for their related tables and nested data blocks.

## Proposed architecture

### 1. Shared table primitives

Extend `components/admin/admin-table.tsx` into a reusable table system:

- `AdminTable`
- `AdminTableToolbar`
- `AdminTableHeader`
- `AdminTableBody`
- `AdminTableRow`
- `AdminTableCell`
- `AdminTablePagination`
- `AdminTableEmpty`
- `AdminTableSkeleton`
- `AdminTableDetailModal`

Keep page-specific query and data mapping in each route, while the shared components own layout, interaction styling, accessibility, and responsive behavior.

### 2. Table configuration

Each page should define a small table configuration containing:

- Column key, label, width, and alignment
- Sortable status and sort direction
- Filter type: text, select, date range, status, or boolean
- Grouping key and group label formatter
- Detail field formatter for the eye modal
- Optional status tone and cell renderer

This avoids duplicating sorting, filtering, and modal behavior across pages.

## Required functionality

### Loading skeletons

- Add a table-specific skeleton with the same column count and approximate row height as the real table.
- Use the existing `app/(admin)/admin/loading.tsx` for route-level loading, but replace the generic blank block with a realistic header, toolbar, and row skeleton.
- Add skeleton states for table refreshes and filter changes without collapsing the table layout.
- Preserve `aria-busy="true"` and an accessible loading announcement.

### Sorting

- Add sortable headers with up/down/neutral sort icons.
- Keep the active sort column visually distinct using the admin accent color.
- Use URL search parameters for sort state so links and browser navigation preserve the view.
- Prefer database-level ordering for large tables; use stable secondary ordering by `id` or timestamp.
- Clearly show when a column is not sortable.

### Filters

- Add a toolbar above each table with search, status filters, date filters, and page-specific filters.
- Use URL search parameters for filters and provide a `Clear filters` action.
- Show active filters as removable chips.
- Debounce free-text search and avoid sending a request for every keystroke.
- Keep filter controls keyboard accessible and usable on narrow screens.

### Grouping

- Support optional grouping by meaningful fields such as status, pipeline status, language, or date.
- Render group headers as sticky or visually separated rows with counts.
- Allow groups to collapse when the table contains many rows.
- Keep sorting inside a group deterministic.
- Do not group by default when it makes the primary operational workflow harder to scan.

### Eye/detail action

- Add a final `Actions` column with an eye icon button on every full table.
- The button opens a modal without navigating away or losing table state.
- Modal content should be organized into:
  - Title and record identity
  - Status badge and key timestamps
  - Primary fields in a two-column definition list
  - Long text, JSON, errors, or logs in readable bordered sections
  - Related records or links where applicable
- Add close button, Escape-to-close, backdrop close, focus trapping, and return focus to the eye button.
- Support deep-linking to a detail page where a route already exists, but keep the modal as the fast inspection path.
- Never expose secrets, raw credentials, or sensitive environment values in the modal.

## Layout and sizing

### Width

- Increase the admin content width by approximately 30% from the current container baseline.
- Prefer a shared max-width token/class in the admin shell rather than page-by-page width overrides.
- Use `width: min(100% - 2rem, 1536px)` or the equivalent Tailwind sizing strategy as the initial target, then validate against the current baseline.
- Keep cards and detail pages aligned to the same content grid.

### Fixed-height tables and scrolling

- Give every primary table a fixed responsive viewport height, targeting `clamp(24rem, 62vh, 48rem)`.
- Keep the page header and toolbar outside the scroll viewport.
- Enable both horizontal and vertical scrolling inside the table viewport.
- Keep the table header sticky at the top of the vertical scroll area.
- Use `min-width` on dense tables so horizontal scrolling is intentional instead of forcing unreadable columns.
- Add visible scrollbar styling that fits both light and dark themes.
- Ensure the modal and page itself do not create competing scroll traps.

## Header, hover, and color system

### Table header

- Use a stronger surface contrast than the body rows.
- Make header labels uppercase or small semibold text with increased tracking.
- Add a bottom border and subtle inset shadow.
- Keep header cells sticky while scrolling.
- Use accent color only for active sorting and interactive header states.

### Rows and cells

- Add subtle alternating row surfaces only where they improve scanning; avoid excessive striping in dark mode.
- Add a clear hover surface, left-edge accent, and transition on row hover.
- Use stronger text for primary identifiers and muted text for metadata.
- Apply status colors consistently through `StatusBadge` and the existing semantic tokens.
- Use distinct but restrained colors for success, warning, danger, info, and neutral states.
- Add focus-visible rings to rows and action buttons.

### Controls

- Use the existing admin semantic tokens from `app/globals.css` as the source of truth.
- Add dedicated tokens for table hover, table selected, table header, scrollbar thumb, and modal overlay if needed.
- Check every new color in both light and dark themes.
- Avoid hard-coded page-specific colors when a semantic token is appropriate.

## Data and API work

1. Inventory each table’s current `findMany` query and fields.
2. Add validated query parsing for `page`, `pageSize`, `sort`, `direction`, filters, and grouping.
3. Add server-side pagination for high-volume tables.
4. Return total count and current page metadata.
5. Add stable ordering and indexes for commonly filtered/sorted fields.
6. Keep dashboard preview tables intentionally small, with a link to the full table.
7. Preserve existing detail routes and make their data usable by the modal formatter.

## Accessibility requirements

- Use semantic table markup and correct header associations.
- Announce loading, filtering, sorting, and empty states.
- Provide accessible names for icon-only sort, filter, eye, close, and pagination controls.
- Ensure keyboard navigation works for all controls and modals.
- Do not rely on color alone for status or selection.
- Verify contrast in both themes.

## Implementation phases

### Phase 1 — Foundation

- Establish shared width and table design tokens.
- Refactor `AdminTable` without changing page data behavior.
- Add fixed-height scroll container, sticky header, hover states, and responsive sizing.
- Build reusable skeleton and empty-state components.

### Phase 2 — Table interactions

- Add URL-backed sorting and pagination.
- Add shared filter toolbar and active filter chips.
- Add grouping support for the tables that benefit from it.

### Phase 3 — Detail inspection

- Build the accessible eye-button modal.
- Add page-specific detail schemas and formatters.
- Add JSON, log, error, timestamp, and related-record presentation patterns.

### Phase 4 — Page rollout

- Roll out to sessions, tasks, recordings, transcripts, translations, video jobs, ads, audio, screens, and workers.
- Update dashboard preview tables with the same visual system while keeping their compact row limits.
- Verify detail pages and modal content match.

### Phase 5 — QA and performance

- Test empty, loading, error, filtered, sorted, grouped, and large-data states.
- Test keyboard-only navigation and screen-reader labels.
- Test light/dark/system themes and responsive widths.
- Confirm horizontal and vertical scroll behavior at laptop and large-monitor sizes.
- Run lint, typecheck, and production build.
- Review database query plans for the new sort/filter combinations.

## Acceptance criteria

- Every admin table has a realistic skeleton loading state.
- Every applicable table supports sorting, filtering, and pagination; grouping is available where useful.
- Every full table has an eye action that opens a polished, accessible detail modal.
- Table areas have fixed responsive heights with working horizontal and vertical scrollbars.
- Admin content width is approximately 30% wider through a shared layout rule.
- Headers, hover states, focus states, status colors, and modal styling are consistent across light and dark themes.
- Existing navigation and detail links continue to work.
- No credentials or sensitive environment data appear in table rows or detail modals.
