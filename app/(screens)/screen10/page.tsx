"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";

const BRANDS = [
  { name: "boAt", logo: "/logo/boat.svg" },
  { name: "Samsung", logo: "/logo/samsung.svg" },
  { name: "Apple", logo: "/logo/apple.svg" },
  { name: "Sony", logo: "/logo/sony.svg" },
] as const;

function wrapIndex(index: number) {
  return (index + BRANDS.length) % BRANDS.length;
}

export default function Screen10Page() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const onRemote = useCallback((value: string) => { const index = BRANDS.findIndex((brand) => brand.name.toLowerCase() === value); if (index >= 0) setActiveIndex(index); }, []);
  const saveBrand = useRealtimeSelection("brand", onRemote);
  const selectBrand = useCallback((index: number) => { setActiveIndex(index); saveBrand(BRANDS[index].name.toLowerCase()); }, [saveBrand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectBrand(wrapIndex(activeIndex + 1));
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectBrand(wrapIndex(activeIndex - 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, selectBrand]);

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
        BRAND SELECTION
      </p>

      <section className="relative z-10 w-full" style={{ width: "min(92vw, 75.6rem)" }} aria-label="Brand selection">
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "clamp(1.4rem, 3.5vmin, 2.45rem)",
          }}
        >
          {BRANDS.map((brand, index) => {
            const isActive = index === activeIndex;
            const isHovered = index === hoveredIndex;
            const isEmphasized = isActive || isHovered;

            return (
              <div key={brand.name} className="relative" style={{ aspectRatio: "1" }}>
                <div
                  aria-hidden="true"
                  className="absolute inset-0 rounded-2xl transition-all duration-300"
                  style={{
                    inset: isActive ? "-0.55rem" : "-0.35rem",
                    opacity: isEmphasized ? (isActive ? 1 : 0.72) : 0,
                    background: "linear-gradient(135deg, rgba(34,211,238,0.9), rgba(99,102,241,0.8), rgba(217,70,239,0.85))",
                    boxShadow: isActive ? "0 14px 32px -14px rgba(34,211,238,0.8)" : "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => selectBrand(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  aria-pressed={isActive}
                  className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl border text-center transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
                  style={{
                    padding: "1.05rem",
                    gap: "clamp(1rem, 3.2vmin, 1.4rem)",
                    background: isHovered && !isActive ? "#eef2ff" : "#ffffff",
                    borderColor: isActive ? "#ffffff" : "#cbd5e1",
                    color: "#0f172a",
                    boxShadow: isActive ? "0 0 26px -16px rgba(255,255,255,0.95)" : isHovered ? "0 0 30px -16px rgba(129,140,248,0.95)" : "none",
                    transform: isHovered && !isActive ? "translateY(-3px)" : "translateY(0)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 transition-opacity duration-300"
                    style={{
                      opacity: isHovered && !isActive ? 1 : 0,
                      background:
                        "radial-gradient(circle at 35% 20%, rgba(34,211,238,0.2), transparent 42%), radial-gradient(circle at 85% 85%, rgba(99,102,241,0.18), transparent 48%)",
                    }}
                  />
                  <span
                    className="relative z-10 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50"
                    style={{ height: "clamp(5.32rem, 11.9vmin, 8.4rem)", padding: "clamp(0.84rem, 1.68vmin, 1.26rem)" }}
                  >
                    <Image
                      src={brand.logo}
                      alt={`${brand.name} logo`}
                      width={160}
                      height={72}
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span className="relative font-bold text-slate-900" style={{ fontSize: "clamp(1.4rem, 3.71vmin, 1.89rem)" }}>
                    {brand.name}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <p className="sr-only" aria-live="polite">
          {BRANDS[activeIndex].name} selected
        </p>
      </section>
    </main>
  );
}
