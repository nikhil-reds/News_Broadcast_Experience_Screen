export type AdBrand = {
  id: string;
  name: string;
  logo?: string;
  ads?: readonly AdAsset[];
};

export type AdIndustry = {
  id: string;
  name: string;
  brands: readonly AdBrand[];
};

export type AdAsset = {
  id: string;
  image: string;
  alt: string;
};

function ad(id: string, image: string, alt: string): AdAsset {
  return { id, image: image.replaceAll(" ", "%20").replaceAll("&", "%26"), alt };
}

export const AD_INDUSTRIES: readonly AdIndustry[] = [
  {
    id: "fmcg",
    name: "FMCG",
    brands: [
      { id: "itc", name: "ITC", logo: "/ads/industry/FMCG/ITC/images.png", ads: [ad("itc-bottom", "/ads/industry/FMCG/ITC/ITC bottom band.png", "ITC bottom band advertisement"), ad("itc-l-band", "/ads/industry/FMCG/ITC/ITC L band.png", "ITC L band advertisement"), ad("itc-side", "/ads/industry/FMCG/ITC/ITC side band.png", "ITC side band advertisement")] },
      { id: "nestle", name: "Nestle", logo: "/ads/industry/FMCG/Nestle/nestle.svg", ads: [ad("nestle-bottom", "/ads/industry/FMCG/Nestle/Nestlé bottom band.png", "Nestle bottom band advertisement"), ad("nestle-l-band", "/ads/industry/FMCG/Nestle/Nestlé L band.png", "Nestle L band advertisement"), ad("nestle-side", "/ads/industry/FMCG/Nestle/Nestlé side band.png", "Nestle side band advertisement")] },
      { id: "pepsico", name: "PepsiCo", logo: "/ads/industry/FMCG/PepsiCo/pepsico.svg", ads: [ad("pepsico-bottom", "/ads/industry/FMCG/PepsiCo/PepsiCo Bottom band.png", "PepsiCo bottom band advertisement"), ad("pepsico-l-band", "/ads/industry/FMCG/PepsiCo/PepsiCo L band.png", "PepsiCo L band advertisement"), ad("pepsico-side", "/ads/industry/FMCG/PepsiCo/PepsiCo side band.png", "PepsiCo side band advertisement")] },
      { id: "tropicana", name: "Tropicana", ads: [ad("tropicana-composite", "/ads/industry/FMCG/Tropicana/Tropicana news composite.png", "Tropicana advertisement")] },
      { id: "unilever", name: "Unilever", logo: "/ads/industry/FMCG/Unilever/unilever.svg", ads: [ad("unilever-bottom", "/ads/industry/FMCG/Unilever/Uniliver bottom.png", "Unilever bottom band advertisement"), ad("unilever-l-band", "/ads/industry/FMCG/Unilever/Uniliver L band.png", "Unilever L band advertisement"), ad("unilever-side", "/ads/industry/FMCG/Unilever/Uniliver side.png", "Unilever side band advertisement")] },
    ],
  },
  {
    id: "consumer-electronics",
    name: "Consumer Electronics",
    brands: [
      { id: "apple", name: "Apple", logo: "/ads/industry/Consumer%20Electronics/Apple/apple.svg", ads: [ad("apple-bottom", "/ads/industry/Consumer Electronics/Apple/Apple Bottom band.png", "Apple bottom band advertisement"), ad("apple-l-band", "/ads/industry/Consumer Electronics/Apple/Apple L band.png", "Apple L band advertisement"), ad("apple-side", "/ads/industry/Consumer Electronics/Apple/Apple side band.png", "Apple side band advertisement")] },
      { id: "boat", name: "boAt", logo: "/ads/industry/Consumer%20Electronics/Boat/boat.svg", ads: [ad("boat-bottom", "/ads/industry/Consumer Electronics/Boat/Boat Bottom band (3).png", "boAt bottom band advertisement"), ad("boat-l-band", "/ads/industry/Consumer Electronics/Boat/Boat L band.png", "boAt L band advertisement"), ad("boat-side", "/ads/industry/Consumer Electronics/Boat/Boat side band.png", "boAt side band advertisement")] },
      { id: "samsung", name: "Samsung", logo: "/ads/industry/Consumer%20Electronics/Samsung/samsung.svg", ads: [ad("samsung-bottom", "/ads/industry/Consumer Electronics/Samsung/Samsung Bottom band.png", "Samsung bottom band advertisement"), ad("samsung-l-band", "/ads/industry/Consumer Electronics/Samsung/Samsung L band.png", "Samsung L band advertisement"), ad("samsung-side", "/ads/industry/Consumer Electronics/Samsung/Samsung side band.png", "Samsung side band advertisement")] },
      { id: "sony", name: "Sony", logo: "/ads/industry/Consumer%20Electronics/Sony/sony.svg", ads: [ad("sony-bottom", "/ads/industry/Consumer Electronics/Sony/Sony Bottom band.png", "Sony bottom band advertisement"), ad("sony-l-band", "/ads/industry/Consumer Electronics/Sony/Sony L band.png", "Sony L band advertisement"), ad("sony-side", "/ads/industry/Consumer Electronics/Sony/Sony side band.png", "Sony side band advertisement")] },
    ],
  },
  {
    id: "banking-finance",
    name: "Banking & Finance",
    brands: [
      { id: "hdfc", name: "HDFC", logo: "/ads/industry/BANKING%20%26%20FINANCE/HDFC/hdfc-bank.svg", ads: [ad("hdfc-bottom", "/ads/industry/BANKING & FINANCE/HDFC/HDFC Bottom band.png", "HDFC bottom band advertisement"), ad("hdfc-l-band", "/ads/industry/BANKING & FINANCE/HDFC/HDFC L band.png", "HDFC L band advertisement"), ad("hdfc-side", "/ads/industry/BANKING & FINANCE/HDFC/HDFC side band.png", "HDFC side band advertisement")] },
      { id: "icici", name: "ICICI", logo: "/ads/industry/BANKING%20%26%20FINANCE/ICICI/icici-bank.svg", ads: [ad("icici-bottom", "/ads/industry/BANKING & FINANCE/ICICI/ICICI bottom band.png", "ICICI bottom band advertisement"), ad("icici-l-band", "/ads/industry/BANKING & FINANCE/ICICI/ICICI L band.png", "ICICI L band advertisement"), ad("icici-side", "/ads/industry/BANKING & FINANCE/ICICI/ICICI side band.png", "ICICI side band advertisement")] },
      { id: "sbi", name: "SBI", logo: "/ads/industry/BANKING%20%26%20FINANCE/SBI/State%20Bank%20Of%20India.png", ads: [ad("sbi-bottom", "/ads/industry/BANKING & FINANCE/SBI/SBI Bottom band.png", "SBI bottom band advertisement"), ad("sbi-l-band", "/ads/industry/BANKING & FINANCE/SBI/SBI L band.png", "SBI L band advertisement"), ad("sbi-side", "/ads/industry/BANKING & FINANCE/SBI/SBI side band.png", "SBI side band advertisement")] },
    ],
  },
  {
    id: "retail-ecommerce",
    name: "Retail & E-Commerce",
    brands: [
      { id: "amazon", name: "Amazon", logo: "/ads/industry/RETAIL%20%26%20E-COMMERCE/Amazon/amazon.svg", ads: [ad("amazon-bottom", "/ads/industry/RETAIL & E-COMMERCE/Amazon/Amazon bottom band.png", "Amazon bottom band advertisement"), ad("amazon-l-band", "/ads/industry/RETAIL & E-COMMERCE/Amazon/Amazon L band.png", "Amazon L band advertisement"), ad("amazon-side", "/ads/industry/RETAIL & E-COMMERCE/Amazon/Amazon side band.png", "Amazon side band advertisement")] },
      { id: "blinkit", name: "BlinkIT", logo: "/ads/industry/RETAIL%20%26%20E-COMMERCE/BlinkIT/Blinkit-yellow-app-icon.svg", ads: [ad("blinkit-bottom", "/ads/industry/RETAIL & E-COMMERCE/BlinkIT/Blinkit-bottom-band.jpeg", "BlinkIT bottom band advertisement"), ad("blinkit-l-band", "/ads/industry/RETAIL & E-COMMERCE/BlinkIT/Blink it L band.jpg.jpeg", "BlinkIT L band advertisement"), ad("blinkit-side", "/ads/industry/RETAIL & E-COMMERCE/BlinkIT/Blink it side Band.jpg.jpeg", "BlinkIT side band advertisement")] },
    ],
  },
] as const;

export const INDUSTRY_IDS = AD_INDUSTRIES.map((industry) => industry.id);
export const BRAND_IDS = AD_INDUSTRIES.flatMap((industry) => industry.brands.map((brand) => brand.id));

export function getIndustryById(id: string | null | undefined): AdIndustry {
  return AD_INDUSTRIES.find((industry) => industry.id === id) ?? AD_INDUSTRIES[0];
}

export function getBrandById(industry: AdIndustry, id: string | null | undefined) {
  return industry.brands.find((brand) => brand.id === id) ?? industry.brands[0];
}

export function getBrandByIdFromCatalog(id: string | null | undefined) {
  return AD_INDUSTRIES.flatMap((industry) => industry.brands).find((brand) => brand.id === id);
}

export function getAdsByBrandId(id: string | null | undefined) {
  return getBrandByIdFromCatalog(id)?.ads ?? [];
}
