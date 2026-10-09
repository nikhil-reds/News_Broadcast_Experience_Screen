# Admin Light / Dark Mode Plan

Scope: the admin panel only (navbar, sidebar, and all 16 admin pages plus their shared components). The sign-in page and the broadcast screens are out of scope for this plan.

## 0. Status

Implemented:
- Theme cookie `admin-theme` (light / dark / system, default system) read on the server in the admin layout (`lib/admin-theme.ts`); saved by `setAdminThemeAction` (`app/actions/admin-theme.ts`).
- Tokens in `app/globals.css`, scoped to `.admin-theme-light`, `.admin-theme-dark`, and `.admin-theme-system` (the last follows `prefers-color-scheme`).
- Toggle in the navbar (`components/admin/admin-theme-toggle.tsx`). It is a three-button segmented control rather than the arrow-key menu in §4; each button is a submit form, so it works without client JavaScript.
- All admin components and pages moved from hardcoded colours to tokens. The sidebar background uses a token and stays dark in both modes. The two code blocks (error `<pre>` and the env sample) stay dark on purpose.
- Checked in the browser: Dark and Light on `/admin/sessions` and `/admin/ads`, with no console errors. The other admin pages use the same shared components but have not been screenshotted in both modes yet.

## 1. Current state (measured)

- **Hardcoded colours:** about 119 colour classes (`bg-white`, `text-slate-*`, `border-slate-*`, `bg-rose-*`, `bg-emerald-*`, and so on) across 24 files in `components/admin/` and `app/(admin)/`.
- **Dark variants:** none. No `dark:` classes exist in the admin code or `app/globals.css`.
- **Inline styles:** none in the admin code, so colour changes stay in class names.
- **Global theme:** `app/globals.css` sets `--background`/`--foreground` from `prefers-color-scheme`, which the admin shell does not use. The admin shell sets its own background and text colours.
- **Sidebar:** already dark (`bg-slate-950`) in the current design.

## 2. Approach

Use **semantic colour tokens**, not `dark:` variants on every class.

- Define tokens once in `app/globals.css` (`--admin-surface`, `--admin-surface-muted`, `--admin-border`, `--admin-text`, `--admin-text-muted`, `--admin-accent`, and a status set: success, warning, danger, info, neutral). Each token has a light value and a dark value.
- Expose them to Tailwind with `@theme inline`, so components use classes like `bg-admin-surface` and `text-admin-muted`.
- Why tokens: 119 occurrences would need about 240 classes with `dark:` variants. Tokens need one definition per colour, and future pages pick up both modes automatically.

## 3. Theme state (no flash, no client-side guess)

- **Storage:** a cookie named `admin-theme` with values `light`, `dark`, or `system`. The default is `system`, which follows the OS setting through `prefers-color-scheme`.
- **Why a cookie, not localStorage:** the admin layout is a server component. It can read the cookie and render the correct theme class on the first HTML response. localStorage would need an inline script and would flash the wrong theme on load.
- **Applying the theme:** `AdminShell` receives the resolved theme from the layout and adds `admin-theme-light` or `admin-theme-dark` to its root `div`. Tokens are scoped to that class, so the broadcast screens are not affected. For `system`, a CSS media query picks the dark values when the OS is dark.
- **Native controls:** set `color-scheme: light` or `color-scheme: dark` on the shell so date inputs, scrollbars and form controls match the theme.

## 4. Toggle in the navbar

- A new client component, `AdminThemeToggle`, sits to the left of the Open Studio button in `AdminNavbar`.
- It shows a sun or moon icon with an accessible label such as "Switch to dark mode", and shows the current choice as a small menu: Light, Dark, System.
- Changing the value calls a server action, `setAdminThemeAction`, which writes the cookie and revalidates the admin path. The server re-renders the shell with the new theme, so there is no client-side state to keep in sync.
- Keyboard: the menu is a proper listbox or radio group, reachable by Tab, with arrow-key selection and Escape to close.

## 5. Shared components to convert

| Component | Change |
|---|---|
| `admin-shell.tsx` | Adds the theme class and `color-scheme` on the root; background becomes `bg-admin-page`. |
| `admin-navbar.tsx` | Surface and border tokens; adds `AdminThemeToggle`. |
| `admin-sidebar.tsx` | See §6. |
| `admin-card.tsx` | Surface, border, and value/detail text tokens. Tone accents (good/warn/bad) get dark-mode border tones. |
| `admin-table.tsx` | Header and row dividers, muted header text, empty-state text. |
| `admin-section.tsx` | Section surface, `DetailItem` inner surface and label colours. |
| `admin-page-header.tsx` | Title and description text tokens; back-link accent. |
| `status-badge.tsx` | Each tone gets a light pair and a dark pair (for example, dark mode uses a deep tinted background with a light text colour). Must still pass contrast. |
| `confirm-submit-button.tsx` | No colour change; the calling page sets the variant. |
| `app/(admin)/admin/loading.tsx` and `error.tsx` | Skeleton and error surfaces use tokens. |

## 6. Sidebar decision

Recommended: **keep the sidebar dark in both modes.** It works as a fixed brand anchor, and the red Sign out button already reads well on dark.

- Light mode sidebar: `bg-admin-sidebar` maps to `slate-900` (a slightly softer dark than the page's `slate-950`) so it still separates from the light page.
- Dark mode sidebar: `slate-950` with a slightly lighter active item, so the active state still stands out.
- Active item and hover colours use the accent token, so both modes stay consistent.

Alternative if you prefer a light sidebar in light mode: the sidebar then uses the surface token and a border, and the active item switches to a tinted accent background. This is more work to keep the Sign out button and email footer legible, so I would only choose it if you want a fully light UI.

## 7. Page-by-page work

Every page uses the shared components, so most of the work is in the shared layer. The table below lists the extra colour work per page.

| Page | Extra colour work |
|---|---|
| `/admin` (Dashboard) | Stat card tone accents in dark mode. |
| `/admin/sessions` | Table with status badges. |
| `/admin/sessions/[id]` | Detail items, nested tables, and status badges. |
| `/admin/screens` | Status badges, table. |
| `/admin/recordings` | Table, "View" link accent. |
| `/admin/audio` | Table, status badge for speaker state. |
| `/admin/transcripts` | Table, truncated preview text. |
| `/admin/translations` | Table, "Listen" link accent. |
| `/admin/ads` | Create form inputs (border, placeholder, focus ring) and the error box. |
| `/admin/ads/[id]` | Detail items, confirm buttons, and the red "Danger zone" block. |
| `/admin/video-jobs` | Table and status badges. |
| `/admin/video-jobs/[id]` | Detail items, error text. |
| `/admin/generation-tasks` | Table and status badges. |
| `/admin/generation-tasks/[id]` | Detail items and the error `<pre>` block. The block is dark in both modes, but its border needs a token. |
| `/admin/workers` | Stat cards and table. |
| `/admin/settings` | Stat cards and the recommended-environment block. The env block is dark in both modes, so it keeps its own colours. |

## 8. Accessibility and contrast

- Body text must reach WCAG AA contrast (4.5:1) in both modes. Muted text needs at least 4.5:1 against its surface, not just against the page.
- Status badges must keep their text readable in dark mode. Check each tone.
- Focus rings must remain visible in both modes (use the accent token).
- Never rely on colour alone for status; the existing text labels already cover this, so keep them.

## 9. Implementation order

1. **Foundation:** tokens in `globals.css`, scoped class on `AdminShell`, cookie reader in the admin layout, `setAdminThemeAction`.
2. **Toggle:** `AdminThemeToggle` in the navbar.
3. **Shared components:** §5, in the order navbar, sidebar, page header, card, table, section, badge, then the loading and error files.
4. **Pages:** §7, starting with the Dashboard, then the list pages, then the detail pages.
5. **Verification:** §10.

## 10. Verification

- Check every admin page in both modes, at 375px, 768px and 1280px widths, with screenshots.
- Check the `system` setting against an OS in light mode and an OS in dark mode.
- Check that reloading does not flash the wrong theme (the cookie is read on the server).
- Run a contrast check on the status badges and muted text in both modes.
- Confirm the broadcast screens look unchanged, since they should not pick up the tokens.
- Run `npx tsc --noEmit` and `npx eslint` after each step.

## 11. Open decisions

1. **Sidebar in light mode:** dark (recommended) or light (§6).
2. **Default theme:** `system` (recommended), or always light until the user picks dark.
3. **Toggle style:** a two-state switch, or the three-option menu in §4 (recommended, because it keeps "System" available).
