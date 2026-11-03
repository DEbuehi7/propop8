/**
 * The AIM-B5R photo screen: the model only describes; fixed code checks its
 * answer, holds every gate and orders the ideas. Synthetic images (flat
 * colours made here) and a fake API only; nothing reaches the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { costUsd, imageTokens, requestBody } from "../lib/b5r/screen/claude";
import { OPPORTUNITY_STEPS, validateObservations } from "../lib/b5r/screen/contract";
import { blockedHits, fitSize, screenPhotos } from "../lib/b5r/screen/pipeline";
import { buildReport, reportHtml } from "../lib/b5r/screen/report";

/** A model answer for two photos: one of everything, plus things the rules must set aside. */
const answer = () => ({
  scene: { kind: "existing_building", summary: "A three-storey brick corner building with arched ground-floor windows." },
  photos: [{ photo: 1, shows: "Street corner, full facade" }, { photo: 2, shows: "Rear yard and fire escape" }, { photo: 9, shows: "not shown" }],
  building: { storiesVisible: 3, construction: "brick masonry", apparentUse: "apartments over vacant ground floor", apparentEra: "appears early 20th century" },
  features: [{ what: "Arched ground-floor windows", photos: [1], basis: "observed" }, { what: "A view", photos: [7], basis: "observed" }],
  conditions: [{ what: "Cracked parapet at the corner", severity: "major", photos: [1], basis: "observed" }],
  hazards: [
    { code: "possible_unreinforced_masonry", note: "Brick bearing walls with no visible ties", photos: [1], basis: "inferred" },
    { code: "flood_or_drainage_low_point", note: "Yard drains toward the building", photos: [2], basis: "observed" },
    { code: "alien_invasion", note: "?", photos: [1], basis: "observed" },
  ],
  opportunities: [
    { step: "Complete redevelopment", title: "Replace with new building", why: "Last resort", photos: [1], basis: "inferred" },
    { step: "Envelope improvements", title: "Repoint brick, restore windows", why: "Keeps the character", photos: [1], basis: "observed" },
    { step: "Access and safety", title: "Step-free entry at the side door", why: "One step at the side", photos: [2], basis: "observed" },
    { step: "ADU / expansion", title: "Rear-yard ADU", why: "Yard is deep; could add about $400k of value", photos: [2], basis: "inferred" },
    { step: "Unit reconfiguration", title: "Ground floor to retail", why: "Corner storefront", photos: [1], basis: "inferred" },
    { step: "Rooftop casino", title: "No", why: "No", photos: [1], basis: "inferred" },
  ],
  limits: ["Interiors, structure behind finishes, the parcel line"],
  peopleOrPlatesVisible: true,
});

test("screen contract: keeps what passes, sets aside money, commerce, unknown codes and photos it wasn't shown", () => {
  const { obs, setAside } = validateObservations(answer(), 2);
  assert.deepEqual(obs.photos.map((p) => p.photo), [1, 2]);
  assert.deepEqual(obs.features.map((f) => f.what), ["Arched ground-floor windows"]);
  assert.deepEqual(obs.hazards.map((h) => h.code), ["possible_unreinforced_masonry", "flood_or_drainage_low_point"]);
  assert.deepEqual(obs.opportunities.map((o) => o.title), ["Replace with new building", "Repoint brick, restore windows", "Step-free entry at the side door"]);
  const reasons = setAside.map((s) => s.reason);
  assert.ok(reasons.some((r) => /cites no photo it was shown \(1 to 2\)/.test(r)));
  assert.ok(reasons.some((r) => /not one of the screen's hazard codes/.test(r)));
  assert.ok(reasons.some((r) => /money or return figures .* \(GOV-17\)/.test(r)), "the $400k ADU idea");
  assert.ok(setAside.some((x) => x.text === "Rear-yard ADU: Yard is deep; could add about [figure removed] of value"), "a set-aside item never shows the figure");
  assert.ok(reasons.some((r) => /residential only \(B5R-33\)/.test(r)), "the retail idea");
  assert.ok(reasons.some((r) => /"Rooftop casino" is not a step/.test(r)));
  assert.throws(() => validateObservations({ scene: {} }, 1), /has no "photos"/);
  const money = validateObservations({ ...answer(), scene: { kind: "x", summary: "Worth $2M at a 5% cap" } }, 2).obs.scene;
  assert.deepEqual(money, { kind: "unclear", summary: "(set aside: the summary contained money figures)" });
});

test("screen report: every gate HOLD, hazards on their gates with fixed next steps, least intervention first", () => {
  const { obs, setAside } = validateObservations(answer(), 2);
  const meta = { title: "Corner <b>", createdAt: "2026-11-02T19:00:00.000Z", intent: null, model: "claude-sonnet-5-5", usage: { inputTokens: 4000, outputTokens: 1200 }, costUsd: 0.02, priceSource: "test", photos: [] };
  const r = buildReport(obs, setAside, meta);
  assert.deepEqual(r.gates.map((g) => [g.gate.split(" ")[0], g.status]), [["G0", "HOLD"], ["G1", "HOLD"], ["G2", "HOLD"], ["G3", "HOLD"], ["G4", "HOLD"], ["G5", "HOLD"], ["G6", "HOLD"]]);
  assert.deepEqual(r.hazards.map((h) => h.gate), ["G4", "G2"]);
  assert.match(r.gates[2].next[0], /^FEMA flood layers saved with their effective date/);
  assert.match(r.gates[4].why, /1 major condition issue/);
  assert.deepEqual(r.opportunities.map((g) => g.step), ["Access and safety", "Envelope improvements", "Complete redevelopment"]);
  assert.ok(r.opportunities.every((g) => g.items.every((o) => o.proof === "CONCEPTUAL")));
  assert.equal(OPPORTUNITY_STEPS.indexOf("Access and safety"), 0);
  assert.ok(r.notices.some((n) => /crop or blur them/.test(n)), "people or plates visible");
  const html = reportHtml({ ...r, scene: { ...r.scene, summary: "<script>alert(1)</script>" } });
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && !html.includes("<script>"), "model text is escaped");
  assert.ok(html.includes("<title>Corner &lt;b&gt; · AIM-B5R photo screen</title>"));
  assert.ok(!/\$\d{3,}|[0-9]% cap/.test(html.replace(/about \$0\.02/, "")), "no money in the report but the API cost");
});

test("screen sizing, cost and blocked names", () => {
  assert.deepEqual(fitSize(4032, 3024), { width: 1238, height: 929 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 }, "never enlarged");
  assert.equal(imageTokens(1000, 1000), 1334, "the vision docs' example");
  assert.equal(costUsd("claude-sonnet-5-5", 1_000_000, 100_000), 3);
  assert.equal(costUsd("claude-haiku-5-5", 1000, 1000), null, "an unpublished price stays unknown");
  assert.deepEqual(blockedHits("intent: the Fictional Arms roof\n/photos/fictional-arms/1.jpg", ["Fictional Arms", "Elm Court", "arms"]), ["Fictional Arms", "arms"]);
  assert.deepEqual(blockedHits("/photos/firearms.jpg", ["arms"]), [], "whole words only");
  const body = requestBody("claude-sonnet-5-5", [{ n: 1, mediaType: "image/jpeg", data: Buffer.from("x") }], "Keep the brick");
  assert.equal(body.tool_choice.name, "record_screen");
  assert.deepEqual((body.messages[0].content as { type: string }[]).map((c) => c.type), ["text", "image", "text"]);
});

async function photo(file: string, w: number, h: number, rgb: [number, number, number]) {
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg().toFile(file);
}

test("screen end to end: dry run sends nothing; a run sends resized copies once and writes the report outside the repo", async () => {
  const root = mkdtempSync(join(tmpdir(), "b5r-screen-"));
  const lines: string[] = [];
  const log = (l: string) => lines.push(l);
  const KEY = "test-key-not-real-0123456789";
  try {
    const shots = join(root, "shots");
    mkdirSync(shots);
    await photo(join(shots, "a.jpg"), 3000, 2000, [180, 90, 60]);
    await photo(join(shots, "b.jpg"), 900, 1200, [60, 120, 90]);
    writeFileSync(join(shots, "notes.txt"), "not a photo");
    const out = join(root, "AIMScenes");
    let calls = 0;
    let sent: { url: string; headers: Record<string, string>; body: { messages: { content: { type: string; source?: { data: string } }[] }[] } } | null = null;
    const fake = async (url: string, init?: RequestInit) => {
      calls++;
      sent = { url, headers: init!.headers as Record<string, string>, body: JSON.parse(init!.body as string) };
      return new Response(JSON.stringify({
        model: "claude-sonnet-5-5", stop_reason: "tool_use", usage: { input_tokens: 3100, output_tokens: 900 },
        content: [{ type: "tool_use", name: "record_screen", input: answer() }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const opts = { root: out, repo: join(root, "repo"), now: () => "2026-11-02T19:00:00.000Z", log, fetch: fake, key: KEY };

    const dry = await screenPhotos([shots], { ...opts, dry: true, intent: "Keep the brick; add homes" });
    assert.equal(calls, 0, "a dry run sends nothing");
    assert.ok(existsSync(join(dry.dir, "request.json")) && !existsSync(join(dry.dir, "report.html")));
    assert.ok(dry.estimateUsd.likely! > 0 && dry.estimateUsd.most! >= dry.estimateUsd.likely!);
    assert.ok(lines.some((l) => /^cost: about \$0\.\d\d, at most \$0\.\d\d \(claude-sonnet-5-5/.test(l)), lines.join("\n"));
    assert.ok(lines.some((l) => /no .*blocked-names\.txt yet/.test(l)));

    const run = await screenPhotos([join(shots, "a.jpg"), join(shots, "b.jpg")], { ...opts, name: "Corner test" });
    assert.equal(calls, 1);
    assert.equal(sent!.url, "https://api.anthropic.com/v1/messages");
    assert.equal(sent!.headers["x-api-key"], KEY);
    const images = sent!.body.messages[0].content.filter((c) => c.type === "image");
    assert.equal(images.length, 2);
    const meta = await sharp(Buffer.from(images[0].source!.data, "base64")).metadata();
    assert.deepEqual([meta.width, meta.height, meta.exif], [1313, 876, undefined], "resized to about 1.15 MP, no metadata");
    assert.equal(run.dir, join(out, "2026-11-02-corner-test"));
    assert.deepEqual(readdirSync(join(run.dir, "photos")), ["01.jpg", "02.jpg"]);
    const html = readFileSync(join(run.dir, "report.html"), "utf8");
    const json = readFileSync(join(run.dir, "report.json"), "utf8");
    assert.ok(html.includes('src="photos/01.jpg"') && html.includes("Repoint brick, restore windows"));
    assert.ok(!html.includes(KEY) && !json.includes(KEY), "the key is never written");
    assert.equal(run.report!.meta.costUsd, 0.0152);
    assert.equal(run.report!.meta.photos[0].sha256.length, 64);

    // The owner's blocked names stop a screen before anything is read or sent.
    writeFileSync(join(out, "blocked-names.txt"), "# employers\nFictional Arms\n");
    await assert.rejects(screenPhotos([shots], { ...opts, intent: "Roof of the Fictional Arms" }), /blocked-names list.*GOV-16/);
    assert.equal(calls, 1);
    await assert.rejects(screenPhotos([shots], { ...opts, root: join(root, "repo", "AIMScenes") }), /can't be written inside the repository/);
    await assert.rejects(screenPhotos([join(shots, "notes.txt")], opts), /not a photo/);
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await assert.rejects(screenPhotos([shots], { ...opts, key: undefined }), /set ANTHROPIC_API_KEY in your shell first/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
    assert.equal(calls, 1, "no key, no call");
    const failing = async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 });
    await assert.rejects(screenPhotos([shots], { ...opts, fetch: failing }), (e: Error) => /Claude API 401: invalid x-api-key \(check ANTHROPIC_API_KEY\)/.test(e.message) && !e.message.includes(KEY));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
