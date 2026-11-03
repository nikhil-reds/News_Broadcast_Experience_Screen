"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AD_INDUSTRIES, getIndustryById } from "@/lib/ad-catalog";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";
import { useWorkflowDirty } from "@/lib/workflow-ready";
import shared from "../screen9/industry.module.css";
import styles from "./brand.module.css";

const copy: Record<string, [string, string]> = {
  amazon: ["Online marketplace", "Online shopping across everyday categories."],
  blinkit: ["Quick commerce", "Quick-commerce grocery delivery."],
  itc: ["Everyday goods", "Food, personal care and household essentials."],
  nestle: ["Food and beverages", "Food and beverages for everyday life."],
  pepsico: ["Snacks and drinks", "Snack foods and refreshment brands."],
  tropicana: ["Fruit juices", "Fruit juices and juice drinks."],
  unilever: ["Consumer goods", "Personal care and household products."],
  apple: ["Personal technology", "Phones, computers and connected devices."],
  boat: ["Audio and wearables", "Headphones, speakers and wearable devices."],
  samsung: ["Consumer electronics", "Mobile devices, displays and appliances."],
  sony: ["Electronics", "Audio, imaging and entertainment technology."],
  hdfc: ["Banking services", "Personal and business banking services."],
  icici: ["Financial services", "Banking, cards and financial services."],
  sbi: ["Banking services", "Retail and commercial banking services."],
};

export default function Screen10Page() {
  const [industryId, setIndustryId] = useState(AD_INDUSTRIES[0].id);
  const [airId, setAirId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const industry = getIndustryById(industryId);
  const brands = industry.brands;
  const onAirIndustry = getIndustryById(industryId);
  const air = onAirIndustry.brands.find(brand => brand.id === airId) ?? onAirIndustry.brands[0];
  const preview = brands.find(brand => brand.id === previewId) ?? brands.find(brand => brand.id === air.id) ?? brands[0];
  useWorkflowDirty(preview.id !== (airId || air.id));
  const updateIndustry = useCallback((id: string) => setIndustryId(id), []);
  useRealtimeSelection("industry", updateIndustry);
  const saveBrand = useRealtimeSelection("brand", setAirId);

  useEffect(() => {
    const apply = () => { saveBrand(preview.id); setPreviewId(""); };
    function navigate(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const index = brands.findIndex(brand => brand.id === preview.id);
      const next = brands[(index + (event.key === "ArrowRight" ? 1 : -1) + brands.length) % brands.length];
      setPreviewId(next.id);
      document.getElementById("brand-" + next.id)?.focus();
    }
    window.addEventListener("apply-screen-brand", apply);
    window.addEventListener("keydown", navigate);
    return () => {
      window.removeEventListener("apply-screen-brand", apply);
      window.removeEventListener("keydown", navigate);
    };
  }, [brands, preview.id, saveBrand]);

  return <main className={shared.stage}>
    <div className={shared.badge}><i aria-hidden="true" />Ad break<span>{air.name} on air</span></div>
    <Link href="/screen9" className={styles.industry} aria-label={"Industry selection: " + industry.name}>‹　{industry.name}</Link>
    <header className={shared.header}>
      <h1>Choose a brand</h1>
      <p aria-live="polite">{copy[preview.id]?.[1] ?? preview.name}</p>
    </header>
    <section className={styles.cards} aria-label={industry.name + " brands"}>
      {brands.map(brand => <button type="button" id={"brand-" + brand.id} key={brand.id}
        className={shared.card + " " + styles.card} aria-pressed={brand.id === preview.id} onClick={() => setPreviewId(brand.id)}>
        {brand.id === air.id && <span className={shared.marker}><i aria-hidden="true" />On air</span>}
        <span className={styles.monogram} aria-hidden="true">{brand.name.charAt(0)}</span>
        <strong>{brand.name}</strong>
        <small>{copy[brand.id]?.[0] ?? industry.name}</small>
      </button>)}
    </section>
  </main>;
}
