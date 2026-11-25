import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import { AD_INDUSTRIES, BRAND_IDS, adVideoBounds } from "../lib/ad-catalog";
import sharp from "sharp";

async function main() {
  assert.equal(AD_INDUSTRIES.length, 3);
  assert.equal(new Set(BRAND_IDS).size, 6);
  let count = 0;
  for (const industry of AD_INDUSTRIES) {
    for (const brand of industry.brands) {
      assert.ok(brand.ads?.some(ad => ad.layout === "l-band"));
      for (const ad of brand.ads ?? []) {
        const filename = join(process.cwd(), "public", ad.image);
        assert.ok(statSync(filename).size > 0);
        const metadata = await sharp(filename).metadata();
        assert.equal(metadata.format, "png");
        assert.ok(metadata.hasAlpha, ad.image);
        const bounds = adVideoBounds(ad);
        assert.equal(bounds.bottom, ["bottom", "l-band"].includes(ad.layout) ? "19.5%" : "0%");
        assert.equal(bounds.left === "0%", ad.layout === "bottom");
        count++;
      }
    }
  }
  assert.equal(count, 21);
  assert.equal(adVideoBounds({id:"aashirvaad-4-side-frame",layout:"side-frame"}).left, "43.2%");
  assert.deepEqual(adVideoBounds(), {top:"0%",right:"0%",bottom:"0%",left:"0%"});
  console.log("PASS: 3 industries, 6 brands, 21 PNG assets and programme bounds.");
}
void main();
