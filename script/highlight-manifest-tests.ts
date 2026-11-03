import assert from "node:assert/strict";
import { parseVisionManifest } from "../lib/local-vision";

const valid = '{"title":"Test","segments":[{"camera":1,"start":0,"end":2,"reason":"clear shot"},{"camera":2,"start":2,"end":4,"reason":"alternate shot"},{"camera":3,"start":4,"end":6,"reason":"third angle"}]}';
assert.equal(parseVisionManifest(valid).segments.length, 3);
assert.equal(parseVisionManifest("Here is JSON:\n```json\n" + valid + "\n```").title, "Test");
assert.throws(() => parseVisionManifest('{"title":"broken"'), /JSON parse failed/);
assert.throws(() => parseVisionManifest('{"title":"missing segments"}'), /schema failed/);
console.log("highlight manifest parser regression tests passed");
