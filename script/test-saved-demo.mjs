// Exercise the actual demo control/API modules with isolated in-memory Redis.
// Fail immediately if any demo path imports a worker, queue, database or MinIO.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const requireModule = createRequire(import.meta.url);
const { NextRequest } = requireModule('next/server');
const root = process.cwd();
const live = {
  'broadcast:active-session-id': 'live-session-at-demo-start',
  'broadcast:session:live-session-at-demo-start:screen-workflow': JSON.stringify({ applied: [1, 2, 3], revision: 3, publishedAt: null }),
  'broadcast:session:live-session-at-demo-start:brightness': JSON.stringify({ brightness: 82 }),
  'broadcast:session:live-session-at-demo-start:brand': JSON.stringify({ value: 'live-brand' }),
};
const values = new Map(Object.entries(live));
let now = Date.now();
class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const redis = {
  get: async key => values.get(key) ?? null,
  set: async (key, value, ...options) => {
    if (options.includes('NX') && values.has(key)) return null;
    values.set(key, value); return 'OK';
  },
  multi() {
    const writes = [];
    const transaction = { set: (...args) => { writes.push(args); return transaction; }, exec: async () => { for (const args of writes) await redis.set(...args); return []; } };
    return transaction;
  },
  eval: async (script, count, ...args) => {
    if (count === 1) {
      if (values.get(args[0]) === args[1]) { values.delete(args[0]); return 1; }
      return 0;
    }
    const [key, , sessionId, value, updatedAt, voiceId] = args;
    const version = JSON.parse(values.get(key) || '{}').version || 0;
    const state = { sessionId, updatedAt, version: version + 1 };
    if (script.includes('brightness =')) state.brightness = Number(value);
    else if (script.includes('audioLanguage =')) { state.audioLanguage = value; state.voiceId = voiceId; }
    else state.value = value;
    const raw = JSON.stringify(state); values.set(key, raw); return raw;
  },
};
const cache = new Map();
function load(filename) {
  const absolute = path.resolve(root, filename);
  if (cache.has(absolute)) return cache.get(absolute);
  if (absolute.endsWith('.json')) return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (/(?:queue|worker|prisma|minio)\.[cm]?tsx?$/.test(absolute)) throw new Error(`Demo imported a processing dependency: ${filename}`);
  const exports = {}; cache.set(absolute, exports);
  const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const importer = name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/redis') return { redisConnection: redis };
    if (name.startsWith('@/') || name.startsWith('.')) {
      const target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(absolute), name);
      return load(path.extname(target) ? target : target + '.ts');
    }
    return requireModule(name);
  };
  vm.runInNewContext(code, { exports, require: importer, process, console, Date: TestDate, Buffer, URL, setTimeout, clearTimeout }, { filename: absolute });
  return exports;
}
const control = load('lib/demo-control.ts');
const { savedDemoResponse } = load('lib/saved-demo-api.ts');
async function request(url, method = 'GET', body) {
  const response = await savedDemoResponse(new NextRequest(`http://localhost${url}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }));
  return response && { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : null, location: response.headers.get('location') };
}
function assertLiveUnchanged() { for (const [key, value] of Object.entries(live)) assert.equal(values.get(key), value, key); }
async function main() {
  const snapshot = await control.savedDemoPackage();
  for (const url of Object.values(snapshot.assets)) assert.ok(fs.statSync(path.join(root, 'public', decodeURIComponent(url))).size > 0);
  assert.equal(await request('/api/sessions/current'), null);
  const demo = await control.startDemo();
  assert.equal(Date.parse(demo.endsAt) - now, 900000);
  assert.equal((await control.startDemo()).sessionId, demo.sessionId, 'Starting an active demo is idempotent');
  assert.equal((await request('/api/sessions/current')).data.session.id, demo.sessionId);
  for (let camera = 1; camera <= 3; camera++) {
    const media = (await request(`/api/save-recording?camera=${camera}`)).data.recordings[0];
    assert.ok(media.url.startsWith('/demo/snapshot/'));
    assert.ok(media.filename.includes('-demo-'));
  }
  for (const language of ['English', 'German', 'Hindi', 'French', 'Spanish']) assert.ok((await request(`/api/subtitle-cues?language=${language}`)).data.cues.length > 0);
  for (const backgroundId of Object.keys(snapshot.composites)) {
    const composite = await request('/api/green-screen/compose', 'POST', { backgroundId, sourceFilename: 'highlight-demo-saved.mp4' });
    assert.equal(composite.status, 200); assert.ok(composite.data.url.startsWith('/demo/snapshot/'));
  }
  const assetKey = Object.keys(snapshot.assets).find(key => key.includes('composites/'));
  const asset = await request('/api/asset/' + assetKey.replace('highlight-', 'highlight-demo-'));
  assert.equal(asset.status, 307); assert.ok(asset.location.includes('/demo/snapshot/'));
  const missing = await request('/api/audio-language', 'POST', { voiceId: 'unsaved-voice', language: 'French' });
  assert.equal(missing.status, 409);
  assert.equal((await request('/api/video-export', 'POST', {})).status, 409);
  await request('/api/brightness/selection', 'POST', { sessionId: demo.sessionId, brightness: 120 });
  assert.equal((await request('/api/sessions/current')).data.session.selectedBrightness, 120);
  await request('/api/audio-language/selection', 'POST', { sessionId: demo.sessionId, audioLanguage: 'de', voiceId: snapshot.voiceId });
  assert.equal((await request('/api/sessions/current')).data.session.selectedAudioLanguage, 'German');
  for (let screen = 1; screen <= 12; screen++) {
    const view = await request(`/api/screen-workflow?screen=${screen}`);
    assert.ok(view.data.active.includes(screen)); assert.equal(view.data.ready, true);
    const applied = await request('/api/screen-workflow', 'POST', { sessionId: demo.sessionId, screen });
    assert.equal(applied.status, 200); assert.ok(applied.data.state.applied.includes(screen));
  }
  assert.ok((await request('/api/screen-workflow?screen=12&output=1')).data.startedAt);
  assertLiveUnchanged();
  await control.stopDemo('manual');
  assert.equal((await control.getDemoState()).active, false);
  assert.equal(await request('/api/screen-workflow?screen=1'), null, 'Live workflow resumes');
  assert.equal((await request('/api/green-screen/compose', 'POST', { sourceFilename: 'highlight-demo-saved.mp4' })).status, 409, 'Late demo requests cannot enqueue live work');
  assertLiveUnchanged();
  const next = await control.startDemo(); assert.notEqual(next.sessionId, demo.sessionId);
  assert.equal((await request('/api/screen-workflow?screen=1')).data.state.applied.length, 0);
  assert.equal((await request('/api/screen-workflow?screen=12&output=1')).data.startedAt, null);
  now += 900001;
  assert.equal((await control.getDemoState()).stoppedReason, 'timeout');
  assert.equal(await request('/api/sessions/current'), null);
  assertLiveUnchanged();
  const restarted = await control.startDemo(); assert.equal(Date.parse(restarted.endsAt) - now, 900000);
  await control.stopDemo('manual');
  assertLiveUnchanged();
  console.log('PASS: saved assets, all 12 Apply steps, broadcasts, selection isolation, manual end, expiry, fresh restart and late-request protection. No worker/database/storage clients imported.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
