import Link from "next/link";

type ScreenPublication = {
  screenId: number;
  currentGenerationId: string | null;
  pendingStatus: string;
  pendingFailureReason: string | null;
  updatedAt: Date;
};

type ScreenDefinition = {
  number: number;
  name: string;
  description: string;
  preview: "camera" | "audio" | "language" | "video" | "advertising" | "final";
};

const SCREENS: ScreenDefinition[] = [
  { number: 1, name: "Camera 01 Footage", description: "Primary camera feed", preview: "camera" },
  { number: 2, name: "Camera 02 Feed", description: "Secondary camera feed", preview: "camera" },
  { number: 3, name: "Camera 03 Feed", description: "Auxiliary camera feed", preview: "camera" },
  { number: 4, name: "Audio in Text", description: "Live speech-to-text output", preview: "audio" },
  { number: 5, name: "Multi-Language", description: "Translated broadcast audio", preview: "language" },
  { number: 6, name: "Edited Video", description: "First edited-video preview", preview: "video" },
  { number: 7, name: "Background Compositing", description: "Virtual background output", preview: "video" },
  { number: 8, name: "Subtitle Language", description: "Dynamic subtitle output", preview: "video" },
  { number: 9, name: "Ad Industry Selection", description: "Advertising industry output", preview: "advertising" },
  { number: 10, name: "Ad Brand Selection", description: "Featured brand output", preview: "advertising" },
  { number: 11, name: "Video with Ads Showcase", description: "Portrait advertisement output", preview: "final" },
  { number: 12, name: "Final Preview", description: "Landscape broadcast output", preview: "final" },
];

const BROADCAST_OUTPUTS = [
  { number: "01", name: "Portrait Mobile", aspect: "9:16", detail: "Vertical phone output", frame: "h-10 aspect-[9/16]" },
  { number: "02", name: "Landscape Mobile", aspect: "16:9", detail: "Horizontal phone output", frame: "w-16 aspect-video" },
  { number: "03", name: "Portrait Tablet", aspect: "3:4", detail: "Vertical tablet output", frame: "h-10 aspect-[3/4]" },
  { number: "04", name: "Landscape Tablet", aspect: "4:3", detail: "Horizontal tablet output", frame: "h-10 aspect-[4/3]" },
  { number: "05", name: "Landscape Tablet + Audio", aspect: "4:3", detail: "Tablet output with broadcast audio", frame: "h-10 aspect-[4/3]" },
  { number: "06", name: "TV / Large Display", aspect: "16:9", detail: "Landscape television output", frame: "w-16 aspect-video" },
] as const;

const previewStyles = {
  camera: "from-indigo-950 via-slate-950 to-violet-950",
  audio: "from-emerald-950 via-slate-950 to-cyan-950",
  language: "from-cyan-950 via-slate-950 to-indigo-950",
  video: "from-violet-950 via-slate-950 to-fuchsia-950",
  advertising: "from-amber-950 via-slate-950 to-rose-950",
  final: "from-blue-950 via-slate-950 to-violet-950",
} as const;

function ScreenThumbnail({ screen }: { screen: ScreenDefinition }) {
  return (
    <div className={`relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br ${previewStyles[screen.preview]}`} aria-hidden="true">
      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:12px_12px]" />
      {screen.preview === "camera" ? (
        <>
          <div className="absolute bottom-2 left-2 right-2 h-px bg-indigo-300/60" />
          <div className="absolute right-2 top-2 size-4 rounded-full border border-indigo-300/50 bg-indigo-300/15" />
        </>
      ) : null}
      {screen.preview === "audio" ? (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {[12, 25, 18, 32, 20].map((height, index) => <i key={index} className="w-1 rounded-full bg-emerald-400/75" style={{ height }} />)}
        </div>
      ) : null}
      {screen.preview === "language" ? <span className="absolute inset-0 grid place-items-center text-[9px] font-semibold tracking-wider text-cyan-200">EN · DE · HI</span> : null}
      {["video", "final"].includes(screen.preview) ? (
        <svg viewBox="0 0 80 48" className="absolute inset-0 h-full w-full text-violet-300/80" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 35C12 34 15 17 25 24s13 12 22 2 14-7 31-18" />
        </svg>
      ) : null}
      {screen.preview === "advertising" ? <div className="absolute inset-x-2 bottom-2 h-2 rounded-sm bg-amber-300/45" /> : null}
      <span className="absolute left-1.5 top-1 text-[8px] font-semibold text-white/55">{String(screen.number).padStart(2, "0")}</span>
    </div>
  );
}

function publishedLabel(value: Date) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Published just now";
  if (elapsedMinutes < 60) return `Published ${elapsedMinutes} min ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `Published ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `Published ${days} ${days === 1 ? "day" : "days"} ago`;
}

function statusFor(publication?: ScreenPublication) {
  if (publication?.pendingStatus === "failed") return { label: "Needs attention", tone: "bg-status-danger-bg text-status-danger-text", dot: "bg-status-danger-text" };
  if (publication?.pendingStatus === "preparing") return { label: "Updating", tone: "bg-status-warning-bg text-status-warning-text", dot: "bg-status-warning-text" };
  if (publication?.currentGenerationId) return { label: "Up to date", tone: "bg-status-success-bg text-status-success-text", dot: "bg-status-success-text" };
  return { label: "Not published", tone: "bg-status-neutral-bg text-status-neutral-text", dot: "bg-status-neutral-text" };
}

export function BroadcastOutputList() {
  return (
    <section className="overflow-hidden rounded-2xl border border-admin-border bg-admin-surface/70 shadow-sm">
      <header className="border-b border-admin-border px-4 py-4 sm:px-5 lg:px-6">
        <h2 className="text-base font-semibold text-admin-text">Broadcast Screen URLs</h2>
        <p className="mt-1 text-sm text-admin-text-muted">Six device-sized outputs for mobile, tablet, and television displays.</p>
      </header>
      <div className="grid gap-px bg-admin-border-subtle lg:grid-cols-2 2xl:grid-cols-3">
        {BROADCAST_OUTPUTS.map((output) => {
          const href = `/broadcast${output.number}`;
          return (
            <article key={output.number} className="flex min-w-0 flex-col bg-admin-surface px-4 py-4 transition-colors hover:bg-admin-table-hover sm:min-h-44 sm:px-5 lg:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-14 w-20 shrink-0 place-items-center rounded-lg border border-admin-border bg-black/45" aria-hidden="true">
                  <div className={`rounded border border-violet-300/50 bg-gradient-to-br from-indigo-950 to-fuchsia-950 shadow-[0_0_16px_rgba(139,92,246,.2)] ${output.frame}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-snug text-admin-text">Broadcast {output.number} · {output.name}</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-admin-text-muted">{output.aspect} · {output.detail}</p>
                </div>
              </div>
              <div className="mt-auto flex min-w-0 flex-col items-stretch gap-3 border-t border-admin-border-subtle pt-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                <code className="min-w-0 break-all text-xs text-admin-text-secondary min-[420px]:truncate" title={href}>{href}</code>
                <Link href={href} target="_blank" aria-label={`Open Broadcast ${output.number} ${output.name}`} className="admin-action min-h-11 shrink-0 px-4 py-1.5 min-[420px]:min-h-9">
                  Open <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ScreenList({ publications }: { publications: ScreenPublication[] }) {
  const publicationByScreen = new Map(publications.map((publication) => [publication.screenId, publication]));

  return (
    <section className="overflow-hidden rounded-2xl border border-admin-border bg-admin-surface/70 shadow-sm">
      <div className="hidden grid-cols-[minmax(18rem,1.2fr)_minmax(10rem,.7fr)_minmax(9rem,.5fr)_auto] gap-4 border-b border-admin-border px-5 py-3 text-xs font-semibold text-admin-text-muted xl:grid">
        <span>Screen ↑</span>
        <span>On screen now</span>
        <span>Status</span>
        <span className="sr-only">Actions</span>
      </div>
      <div className="grid gap-px bg-admin-border-subtle lg:grid-cols-2 xl:block xl:divide-y xl:divide-admin-border-subtle">
        {SCREENS.map((screen) => {
          const publication = publicationByScreen.get(screen.number);
          const status = statusFor(publication);
          const generation = publication?.currentGenerationId;
          return (
            <article key={screen.number} className="grid min-w-0 content-start gap-4 bg-admin-surface px-4 py-4 transition-colors hover:bg-admin-table-hover sm:min-h-64 sm:px-5 xl:min-h-0 xl:grid-cols-[minmax(18rem,1.2fr)_minmax(10rem,.7fr)_minmax(9rem,.5fr)_auto] xl:items-center xl:gap-4 xl:px-5 xl:py-3">
              <div className="flex min-w-0 items-center gap-3">
                <ScreenThumbnail screen={screen} />
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold leading-snug text-admin-text xl:truncate">Screen {screen.number} · {screen.name}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-admin-text-muted xl:truncate">/screen{screen.number} · {screen.description}</p>
                </div>
              </div>
              <div className="min-w-0">
                <p className="break-all font-mono text-xs font-semibold text-admin-text-secondary xl:truncate" title={generation ?? "No generation published"}>{generation ? generation.slice(0, 8) : "Awaiting publish"}</p>
                <p className="mt-1 text-xs text-admin-text-muted">{publication && generation ? publishedLabel(publication.updatedAt) : "No output published yet"}</p>
              </div>
              <div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.tone}`} title={publication?.pendingFailureReason ?? undefined}>
                  <i className={`size-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                  {status.label}
                </span>
              </div>
              <div className="mt-auto flex xl:mt-0 xl:justify-end">
                <Link href={`/screen${screen.number}`} target="_blank" aria-label={`Open Screen ${screen.number}`} className="admin-action min-h-11 w-full px-4 py-1.5 sm:w-auto xl:min-h-9">
                  Open <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
