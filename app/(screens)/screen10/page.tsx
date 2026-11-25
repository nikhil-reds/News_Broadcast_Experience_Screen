"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AD_INDUSTRIES, getIndustryById } from "@/lib/ad-catalog";
import { abroSans } from "@/lib/abro-sans";
import { poppins } from "@/lib/poppins";
import { useRealtimeSelection } from "@/lib/use-realtime-selection";
import { useWorkflowDirty } from "@/lib/workflow-ready";
import shared from "../screen9/industry.module.css";
import styles from "./brand.module.css";

const copy: Record<string, [string, string]> = {
  aashirvaad: ["Shudh Chakki Atta", "Aashirvaad whole wheat atta."],
  dove: ["Body wash", "Dove personal care and body wash."],
  samsung: ["Galaxy smartphone", "Samsung Galaxy smartphone campaign."],
  sony: ["Wireless headphones", "Sony wireless audio campaign."],
  axis: ["Credit card", "Axis Bank credit card campaign."],
  hdfc: ["Credit card", "HDFC Bank credit card campaign."],
};

export default function Screen10Page() {
  const [committedIndustryId, setCommittedIndustryId] = useState(AD_INDUSTRIES[0].id);
  const [previewIndustryId, setPreviewIndustryId] = useState<string | null>(null);
  const [airId, setAirId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const industryId = previewIndustryId ?? committedIndustryId;
  const industry = getIndustryById(industryId);
  const brands = industry.brands;
  const onAirIndustry = getIndustryById(industryId);
  const air = onAirIndustry.brands.find(brand => brand.id === airId) ?? onAirIndustry.brands[0];
  const preview = brands.find(brand => brand.id === previewId) ?? brands.find(brand => brand.id === air.id) ?? brands[0];
  useWorkflowDirty(preview.id !== (airId || air.id));
  const updateCommittedIndustry = useCallback((id: string) => setCommittedIndustryId(id), []);
  const updatePreviewIndustry = useCallback((id: string) => setPreviewIndustryId(id), []);
  useRealtimeSelection("industry", updateCommittedIndustry);
  useRealtimeSelection("industry-preview", updatePreviewIndustry);
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

  return <main className={`${poppins.className} ${shared.stage}`}>
    <div className={shared.badge}><i aria-hidden="true" />Ad break<span>{air.name} on air</span></div>
    <Link href="/screen9" className={styles.industry} aria-label={"Industry selection: " + industry.name}>‹　{industry.name}</Link>
    <header className={shared.header}>
      <h1 className={abroSans.className}>Choose a brand</h1>
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
