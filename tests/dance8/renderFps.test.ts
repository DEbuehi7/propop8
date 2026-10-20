// The render uses the clips' own frame rate (lib/dance8/render/fps.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseRenderFps, parseRate, standardFps, FALLBACK_FPS } from "../../lib/dance8/render/fps";

test("ffprobe rates parse, NTSC rates snap to the standard ones", () => {
  assert.equal(parseRate("30/1"), 30);
  assert.ok(Math.abs(parseRate("24000/1001") - 23.976) < 0.001);
  assert.ok(Number.isNaN(parseRate("0/0")));
  assert.equal(standardFps(parseRate("24000/1001")), 24);
  assert.equal(standardFps(29.97), 30);
  assert.equal(standardFps(59.94), 60);
  assert.equal(standardFps(48), 48);
  assert.equal(standardFps(27), null);
  assert.equal(standardFps(NaN), null);
});

test("the rate most clips share wins; a tie goes to the lower rate", () => {
  assert.deepEqual(chooseRenderFps([24, 24, 23.976]), { fps: 24, sourceFps: 24, uneven: [] });
  assert.deepEqual(chooseRenderFps([30, 30, 24]), { fps: 30, sourceFps: 30, uneven: [24] });
  assert.deepEqual(chooseRenderFps([24, 30]), { fps: 24, sourceFps: 24, uneven: [30] });
});

test("above 30 fps the rate is halved, so frames drop evenly", () => {
  assert.deepEqual(chooseRenderFps([48, 48, 24]), { fps: 24, sourceFps: 48, uneven: [] });
  assert.deepEqual(chooseRenderFps([60, 59.94]), { fps: 30, sourceFps: 60, uneven: [] });
  assert.deepEqual(chooseRenderFps([50]), { fps: 25, sourceFps: 50, uneven: [] });
});

test("with no readable rate the render keeps its old default", () => {
  assert.deepEqual(chooseRenderFps([]), { fps: FALLBACK_FPS, sourceFps: null, uneven: [] });
  assert.deepEqual(chooseRenderFps([NaN, 0, 13]), { fps: FALLBACK_FPS, sourceFps: null, uneven: [] });
});
