"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AD_INDUSTRIES, getIndustryById } from "@/lib/ad-catalog";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";

function wrapIndex(index: number, length: number) {
  return (index + length) % length;
}

export default function Screen10Page() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [industryId, setIndustryId] = useState<string>(AD_INDUSTRIES[0].id);
  const selectedIndustry = getIndustryById(industryId);
  const brands = selectedIndustry.brands;
  const onRemoteIndustry = useCallback((value: string) => { if (AD_INDUSTRIES.some((industry) => industry.id === value)) { setIndustryId(value); setActiveIndex(0); setHoveredIndex(null); } }, []);
  const onRemoteBrand = useCallback((value: string) => { const index = brands.findIndex((brand) => brand.id === value); if (index >= 0) setActiveIndex(index); }, [brands]);
  useRealtimeSelection("industry", onRemoteIndustry);
  const saveBrand = useRealtimeSelection("brand", onRemoteBrand);
  const selectBrand = useCallback((index: number) => { setActiveIndex(index); saveBrand(brands[index].id); }, [brands, saveBrand]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        selectBrand(wrapIndex(activeIndex + 1, brands.length));
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectBrand(wrapIndex(activeIndex - 1, brands.length));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, brands.length, selectBrand]);

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
        {selectedIndustry.name} Brand Selection
      </p>

      <section className="relative z-10 w-full" style={{ width: "min(92vw, 75.6rem)" }} aria-label="Brand selection">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${Math.min(brands.length, 4)}, minmax(0, 1fr))`,
            gap: "clamp(1.4rem, 3.5vmin, 2.45rem)",
            justifyContent: "center",
          }}
        >
          {brands.map((brand, index) => {
            const isActive = index === activeIndex;
            const isHovered = index === hoveredIndex;
            const isEmphasized = isActive || isHovered;

            return (
              <div key={brand.id} className="relative" style={{ aspectRatio: "1" }}>
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
                    {brand.logo ? (
                      <Image
                        src={brand.logo}
                        alt={`${brand.name} logo`}
                        width={180}
                        height={96}
                        unoptimized
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-center text-3xl font-black text-slate-800">{brand.name}</span>
                    )}
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
          {brands[activeIndex]?.name} selected
        </p>
      </section>
    </main>
  );
}
