import catalog from "./ad-catalog-data.json";

export type AdLayout = "l-band" | "bottom" | "side" | "side-frame";
export type AdAsset = { id: string; image: string; alt: string; layout: AdLayout };
export type AdBrand = { id: string; name: string; logo?: string; ads?: readonly AdAsset[] };
export type AdIndustry = { id: string; name: string; brands: readonly AdBrand[] };
export const AD_INDUSTRIES: readonly AdIndustry[] = catalog as AdIndustry[];
export const INDUSTRY_IDS = AD_INDUSTRIES.map(industry => industry.id);
export const BRAND_IDS = AD_INDUSTRIES.flatMap(industry => industry.brands.map(brand => brand.id));
export function getIndustryById(id: string | null | undefined): AdIndustry {
  return AD_INDUSTRIES.find(industry => industry.id === id) ?? AD_INDUSTRIES[0];
}
export function getBrandById(industry: AdIndustry, id: string | null | undefined) {
  return industry.brands.find(brand => brand.id === id) ?? industry.brands[0];
}
export function getBrandByIdFromCatalog(id: string | null | undefined) {
  return AD_INDUSTRIES.flatMap(industry => industry.brands).find(brand => brand.id === id);
}
export function getIndustryByBrandId(id: string | null | undefined) {
  return AD_INDUSTRIES.find(industry => industry.brands.some(brand => brand.id === id));
}
export function getAdsByBrandId(id: string | null | undefined) {
  return (getBrandByIdFromCatalog(id) ?? AD_INDUSTRIES[0].brands[0]).ads ?? [];
}

/** Match the transparent programme window in the supplied campaign artwork. */
export function adVideoBounds(ad?: { layout?: AdLayout; id: string }) {
  const layout = ad?.layout;
  const left = layout === "side-frame" && ad?.id === "aashirvaad-4-side-frame" ? "43.2%" : "13.6%";
  return { top: "0%", right: "0%", bottom: layout === "l-band" || layout === "bottom" ? "19.5%" : "0%", left: layout && layout !== "bottom" ? left : "0%" };
}
