/**
 * The local page server for `dance8 moves` (canon D8-17): local only, one-time
 * key, serves only the tracker's bundle and wasm, the model and the frames,
 * and hands back what the page sends. Fake files only; no browser needed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PreparedTake } from "../../lib/dance8/movesPipeline";
import { manualSync } from "../../lib/dance8/moves/sync";
import { captureTakes } from "../../scripts/dance8/capture/server";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "d8-tracker-"));
  mkdirSync(join(root, "wasm"));
  writeFileSync(join(root, "vision_bundle.mjs"), "export const ok = 1;");
  writeFileSync(join(root, "wasm", "vision_wasm_internal.wasm"), Buffer.from([0, 97, 115, 109]));
  writeFileSync(join(root, "package.json"), "{}");
  const frames = mkdtempSync(join(tmpdir(), "d8-frames-"));
  for (let i = 1; i <= 3; i++) writeFileSync(join(frames, `${String(i).padStart(6, "0")}.jpg`), Buffer.from(`frame ${i}`));
  const model = join(root, "model.task");
  writeFileSync(model, "model bytes");
  const take: PreparedTake = {
    takeId: "take", videoPath: "/nowhere/take.mov", sha256: "0".repeat(64), probe: { durationSec: 0.1, videoStartSec: 0, audioStartSec: 0 },
    sync: manualSync(1, "x"), frameDir: frames, frames: 3, width: 720, height: 1280, fps: 30,
  };
  return { root, model, take };
}

function start(fx: ReturnType<typeof fixture>) {
  let url = "";
  const logs: string[] = [];
  const done = captureTakes([fx.take], { modelPath: fx.model, open: false, log: (l) => logs.push(l), trackerRoot: fx.root, onUrl: (u) => { url = u; } });
  return { done, logs, url: () => url };
}
const until = async (f: () => string) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 10)); return f(); };

test("the page server is local, keyed, and serves only what the page needs", async () => {
  const fx = fixture();
  const s = start(fx);
  const url = new URL(await until(s.url));
  assert.equal(url.hostname, "127.0.0.1");
  const key = url.searchParams.get("k")!;
  assert.match(key, /^[0-9a-f]{32}$/);
  const base = url.origin;
  const get = (p: string) => fetch(base + p);
  assert.equal((await get("/")).status, 403, "no key, no page");
  assert.equal((await get("/?k=wrong")).status, 403);
  const page = await get(`/?k=${key}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Reading your moves/);
  assert.equal((await get("/mp/vision_bundle.mjs")).headers.get("content-type"), "text/javascript");
  assert.equal((await get("/mp/wasm/vision_wasm_internal.wasm")).headers.get("content-type"), "application/wasm");
  assert.equal((await get("/mp/package.json")).status, 404, "only the bundle and wasm");
  assert.ok((await get("/mp/%2e%2e/%2e%2e/etc/passwd")).status >= 400, "a climb out of the tracker folder is never served");
  const raw = await new Promise<number>((ok) => request({ host: "127.0.0.1", port: Number(url.port), path: "/mp/..%2f..%2fpackage.json" }, (r) => { r.resume(); ok(r.statusCode ?? 0); }).end());
  assert.equal(raw, 404);
  assert.equal((await get(`/model`)).status, 403);
  assert.equal(await (await get(`/model?k=${key}`)).text(), "model bytes");
  assert.deepEqual(await (await get(`/job?k=${key}`)).json(), { takes: [{ id: "take", frames: 3, fps: 30, width: 720, height: 1280 }] });
  assert.equal(await (await get(`/frame/0/2?k=${key}`)).text(), "frame 3", "frame i is the (i+1)th file");
  assert.equal((await get(`/frame/0/3?k=${key}`)).status, 404);
  assert.equal((await get(`/frame/0/0`)).status, 403, "your frames need the key");
  await fetch(`${base}/progress?k=${key}`, { method: "POST", body: JSON.stringify({ take: 0, done: 3 }) });
  const frames = [{ image: null, world: null }, { image: [0.5], world: [0] }, { image: null, world: null }];
  assert.equal((await fetch(`${base}/result/0`, { method: "POST", body: JSON.stringify({ delegate: "GPU", frames }) })).status, 403);
  assert.equal((await fetch(`${base}/result/0?k=${key}`, { method: "POST", body: JSON.stringify({ delegate: "GPU", frames }) })).status, 204);
  assert.deepEqual(await s.done, [{ delegate: "GPU", frames }]);
  assert.ok(s.logs.some((l) => /100%/.test(l)));
});

test("a page that stops is reported, not waited on", async () => {
  const fx = fixture();
  const s = start(fx);
  const stopped = assert.rejects(s.done, /the browser page stopped: no camera model/);
  const url = new URL(await until(s.url));
  await fetch(`${url.origin}/fail?k=${url.searchParams.get("k")}`, { method: "POST", body: JSON.stringify({ message: "no camera model" }) });
  await stopped;
});
