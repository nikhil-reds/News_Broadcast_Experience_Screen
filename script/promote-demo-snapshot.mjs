import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const sourceName = process.argv[2];
const targetName = process.argv[3];
const allowed = new Set(["snapshot", "latest", "newest"]);
if (!allowed.has(sourceName) || !allowed.has(targetName) || sourceName === targetName) {
  throw new Error("Usage: node script/promote-demo-snapshot.mjs <source> <target>");
}

const demoRoot = resolve("public", "demo");
const sourceRoot = resolve(demoRoot, sourceName);
const targetRoot = resolve(demoRoot, targetName);
for (const path of [sourceRoot, targetRoot]) {
  if (!path.startsWith(`${demoRoot}\\`) && !path.startsWith(`${demoRoot}/`)) {
    throw new Error("Demo package path escaped public/demo");
  }
}

const snapshot = JSON.parse(await readFile(join(sourceRoot, "snapshot.json"), "utf8"));
if (snapshot.version !== 2 || !snapshot.assets || !snapshot.recordings?.length || !snapshot.audioFiles?.length) {
  throw new Error(`The ${sourceName} demo package is incomplete.`);
}

const sourcePrefix = `/demo/${sourceName}/`;
const targetPrefix = `/demo/${targetName}/`;
const assetUrls = [...new Set(Object.values(snapshot.assets))];
for (const url of assetUrls) {
  if (typeof url !== "string" || !url.startsWith(`${sourcePrefix}assets/`)) {
    throw new Error(`Unexpected asset URL in ${sourceName}: ${String(url)}`);
  }
  const sourcePath = resolve("public", decodeURIComponent(url).replace(/^\/+/, ""));
  if (!sourcePath.startsWith(`${sourceRoot}\\`) && !sourcePath.startsWith(`${sourceRoot}/`)) {
    throw new Error("Source asset escaped its package directory");
  }
  const info = await stat(sourcePath);
  if (!info.size) throw new Error(`Empty source asset: ${relative(sourceRoot, sourcePath)}`);
  const destination = resolve(targetRoot, relative(sourceRoot, sourcePath));
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(sourcePath, `${destination}.partial`);
  await rename(`${destination}.partial`, destination);
}

const promoted = JSON.stringify(snapshot, null, 2).split(sourcePrefix).join(targetPrefix) + "\n";
await mkdir(targetRoot, { recursive: true });
await writeFile(join(targetRoot, "snapshot.json.partial"), promoted);
await rename(join(targetRoot, "snapshot.json.partial"), join(targetRoot, "snapshot.json"));
console.log(`Promoted public/demo/${sourceName} to public/demo/${targetName}: ${assetUrls.length} assets.`);
