import { setAdminThemeAction } from "@/app/actions/admin-theme";
import type { AdminTheme } from "@/lib/admin-theme";

const options: { value: AdminTheme; label: string; icon: React.ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
  },
  { value: "dark", label: "Dark", icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /> },
  {
    value: "system",
    label: "System",
    icon: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
  },
];

export function AdminThemeToggle({ theme }: { theme: AdminTheme }) {
  return (
    <div role="group" aria-label="Colour theme" className="inline-flex rounded-md border border-admin-border p-0.5">
      {options.map((option) => {
        const active = theme === option.value;
        return (
          <form key={option.value} action={setAdminThemeAction}>
            <input type="hidden" name="theme" value={option.value} />
            <button
              type="submit"
              aria-pressed={active}
              title={`${option.label} theme`}
              aria-label={`Use ${option.label.toLowerCase()} theme`}
              className={`inline-flex items-center justify-center rounded px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-focus ${
                active
                  ? "bg-admin-control-active text-admin-text"
                  : "text-admin-text-muted hover:text-admin-text"
              }`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-3.5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {option.icon}
              </svg>
            </button>
          </form>
        );
      })}
    </div>
  );
}
