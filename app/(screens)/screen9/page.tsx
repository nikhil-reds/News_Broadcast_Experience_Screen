"use client";

import { useCallback, useEffect, useState } from "react";
import { AD_INDUSTRIES } from "@/lib/ad-catalog";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";
import { useWorkflowDirty } from "@/lib/workflow-ready";
import styles from "./industry.module.css";

const details: Record<string, { subtitle: string; description: string; icon: string }> = {
  fmcg: { subtitle: "Everyday goods", description: "Food, drinks, personal care and household brands.", icon: "M5 9h14l-2 12H7L5 9Zm3 0V7a4 4 0 0 1 8 0v2M9 13h6" },
  "consumer-electronics": { subtitle: "Devices and gadgets", description: "Phones, TVs, audio, laptops and smart-home brands.", icon: "M9 2h6a1.5 1.5 0 0 1 1.5 1.5v17A1.5 1.5 0 0 1 15 22H9a1.5 1.5 0 0 1-1.5-1.5v-17A1.5 1.5 0 0 1 9 2Zm2 17h2M5 11a4 4 0 0 0-3 4m17-4a4 4 0 0 1 3 4" },
  "banking-finance": { subtitle: "Money and insurance", description: "Banks, cards, insurance and investment brands.", icon: "m2 8 10-6 10 6M4 10v9m5-9v9m6-9v9m5-9v9M2 22h20" },
  "retail-ecommerce": { subtitle: "Shops and marketplaces", description: "Stores, online marketplaces and delivery apps.", icon: "M2 3h3l3.5 12h10l3-8H6m4 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" },
};

export default function Screen9Page() {
  const [onAir, setOnAir] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const selected = preview ?? onAir;
  useWorkflowDirty(selected !== onAir);
  const onRemote = useCallback((id: string) => {
    const index = AD_INDUSTRIES.findIndex(industry => industry.id === id);
    if (index >= 0) setOnAir(index);
  }, []);
  const saveIndustry = useRealtimeSelection("industry", onRemote);
  const choose = setPreview;

  useEffect(() => {
    function apply() {
      if (selected === onAir) return;
      const industry = AD_INDUSTRIES[selected];
      saveIndustry(industry.id);
      setPreview(null);
    }
    function navigate(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const count = AD_INDUSTRIES.length;
      const next = (selected + (event.key === "ArrowLeft" ? -1 : 1) + count) % count;
      choose(next);
      document.getElementById("industry-" + AD_INDUSTRIES[next].id)?.focus();
    }
    window.addEventListener("apply-screen-industry", apply);
    window.addEventListener("keydown", navigate);
    return () => {
      window.removeEventListener("apply-screen-industry", apply);
      window.removeEventListener("keydown", navigate);
    };
  }, [selected, onAir, saveIndustry, choose]);

  return <main className={styles.stage}>
    <div className={styles.badge}><i aria-hidden="true" />Ad break<span>{AD_INDUSTRIES[onAir].name} on air</span></div>
    <header className={styles.header}>
      <h1>Choose an industry</h1>
      <p aria-live="polite">{details[AD_INDUSTRIES[selected].id].description}</p>
    </header>
    <section className={styles.cards} aria-label="Advertisement industry">
      {AD_INDUSTRIES.map((industry, index) => <button key={industry.id} id={"industry-" + industry.id}
        className={styles.card} type="button" aria-pressed={selected === index} onClick={() => choose(index)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={details[industry.id].icon} /></svg>
        {index === onAir && <span className={styles.marker}><i />On air</span>}
        <strong>{industry.name}</strong>
        <small>{details[industry.id].subtitle}</small>
      </button>)}
    </section>
  </main>;
}
