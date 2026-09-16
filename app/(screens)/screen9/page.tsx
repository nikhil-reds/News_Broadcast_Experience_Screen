"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";

const AD_INDUSTRIES = [
  "FMCG",
  "Consumer Electronics",
  "Banking & Finance",
  "Retail & E-commerce",
];

function wrapIndex(index: number) {
  return (index + AD_INDUSTRIES.length) % AD_INDUSTRIES.length;
}

export default function Screen9Page() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const onRemote = useCallback((value: string) => { const index = AD_INDUSTRIES.findIndex((item) => item.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "") === value); if (index >= 0) setActiveIndex(index); }, []);
  const saveIndustry = useRealtimeSelection("industry", onRemote);
  const selectIndustry = useCallback((index: number) => { setActiveIndex(index); saveIndustry(["fmcg", "consumer-electronics", "banking-finance", "retail-ecommerce"][index]); }, [saveIndustry]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectIndustry(wrapIndex(activeIndex - 1));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectIndustry(wrapIndex(activeIndex + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, selectIndustry]);

  return (
    <main
      className="relative grid min-h-screen overflow-hidden px-6 font-sans text-white"
      style={{
        placeItems: "center",
        background: "radial-gradient(circle at 50% 35%, #182b78 0%, #0b1745 36%, #020617 82%)",
      }}
    >
      <p
        className="absolute left-6 right-6 text-center font-semibold uppercase text-cyan-100"
        style={{
          top: "clamp(3.5rem, 8vh, 6rem)",
          fontSize: "clamp(1.56rem, 4.42vmin, 2.6rem)",
          letterSpacing: "0.14em",
        }}
      >
        Advertisement Industry Selection
      </p>
      <section
        aria-label="Advertisement industry selection"
        className="w-full"
        style={{ width: "min(92vw, 75.6rem)" }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "clamp(1.4rem, 3.5vmin, 2.45rem)",
          }}
        >
          {AD_INDUSTRIES.map((industry, index) => {
            const isActive = index === activeIndex;
            const isHovered = index === hoveredIndex;
            const isEmphasized = isActive || isHovered;

            return (
              <div key={industry} className="relative" style={{ aspectRatio: "1" }}>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-2xl transition-all duration-300"
                  style={{
                    inset: isActive ? "-0.55rem" : "-0.35rem",
                    transform: "none",
                    opacity: isEmphasized ? (isActive ? 1 : 0.72) : 0,
                    background: "linear-gradient(135deg, rgba(34,211,238,0.9), rgba(99,102,241,0.8), rgba(217,70,239,0.85))",
                    boxShadow: isActive ? "0 14px 32px -14px rgba(34,211,238,0.8)" : "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => selectIndustry(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  aria-pressed={isActive}
                  style={
                    isActive
                      ? {
                          padding: "0.75rem",
                          fontSize: "clamp(1.4rem, 3.71vmin, 1.89rem)",
                          lineHeight: 1.2,
                          color: "#0f172a",
                          background: "#ffffff",
                          boxShadow: "0 0 26px -16px rgba(255,255,255,0.95)",
                        }
                      : {
                          padding: "0.75rem",
                          fontSize: "clamp(1.4rem, 3.71vmin, 1.89rem)",
                          lineHeight: 1.2,
                          color: "#0f172a",
                          background: isHovered ? "#eef2ff" : "#ffffff",
                          boxShadow: isHovered ? "0 0 30px -16px rgba(129,140,248,0.95)" : "none",
                        }
                  }
                  className={`relative z-10 h-full w-full overflow-hidden rounded-2xl border text-center font-bold text-slate-950 transition-all duration-300 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 ${
                    isActive
                      ? "border-white"
                      : "border-slate-300 hover:border-indigo-300/80"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-2xl transition-opacity duration-300"
                    style={{
                      opacity: isHovered && !isActive ? 1 : 0,
                      background:
                        "radial-gradient(circle at 35% 20%, rgba(34,211,238,0.2), transparent 42%), radial-gradient(circle at 85% 85%, rgba(99,102,241,0.18), transparent 48%)",
                    }}
                  />
                  <span className="relative z-10">{industry}</span>
                </button>
              </div>
            );
          })}
        </div>
        <p className="sr-only" aria-live="polite">
          {AD_INDUSTRIES[activeIndex]} selected
        </p>
      </section>
    </main>
  );
}
