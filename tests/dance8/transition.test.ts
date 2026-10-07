import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTransition,
  resolveTransitionCost,
  canTransition,
} from "../../lib/dance8/runtime/TransitionResolver";
import graphData from "../../fixtures/transitions-demo.json";
import type { TransitionGraph, TransitionEdge } from "../../lib/dance8/contracts/transition";

const edge = (o: Partial<TransitionEdge> & Pick<TransitionEdge, "id" | "fromClipId" | "toClipId">): TransitionEdge => ({
  cost: 0.2,
  blendMs: 250,
  compatible: true,
  ...o,
});
const graphOf = (edges: TransitionEdge[]): TransitionGraph => ({
  id: "g",
  schemaVersion: 1,
  version: 1,
  dancerFamily: "test",
  edges,
});

test("resolver: a valid one-edge graph resolves that edge", () => {
  const e = edge({ id: "e1", fromClipId: "a", toClipId: "b" });
  const r = resolveTransition("a", "b", graphOf([e]));
  assert.equal(r.edge?.id, "e1");
  assert.equal(r.isFallback, false);
  assert.equal(r.reason, "direct edge found");
  assert.equal(canTransition("a", "b", graphOf([e])), true);
});

test("resolver: a missing direct edge uses the fallback from the same source", () => {
  const fb = edge({ id: "fb", fromClipId: "a", toClipId: "safe", fallbackOnly: true });
  const r = resolveTransition("a", "b", graphOf([fb]));
  assert.equal(r.edge?.id, "fb");
  assert.equal(r.isFallback, true);
  assert.equal(r.reason, "direct edge missing, using fallback");
});

test("resolver: an incompatible direct edge is not used; the fallback is", () => {
  const bad = edge({ id: "bad", fromClipId: "a", toClipId: "b", compatible: false });
  const fb = edge({ id: "fb", fromClipId: "a", toClipId: "safe", fallbackOnly: true });
  const r = resolveTransition("a", "b", graphOf([bad, fb]));
  assert.equal(r.edge?.id, "fb");
  assert.equal(r.isFallback, true);
  assert.equal(r.reason, "direct edge incompatible, using fallback");
});

test("resolver: no edge and no fallback resolves to null, at max cost + 0.3", () => {
  const r = resolveTransition("a", "b", graphOf([edge({ id: "x", fromClipId: "c", toClipId: "d" })]));
  assert.equal(r.edge, null);
  assert.equal(r.reason, "no edge found");
  assert.equal(resolveTransitionCost(r, 0.5), 0.8);
});

test("resolver: every compatible, non-fallback edge in the demo graph resolves to itself", () => {
  const graph = graphData as unknown as TransitionGraph;
  const direct = graph.edges.filter((e) => e.compatible && !e.fallbackOnly);
  assert.ok(direct.length > 0);
  for (const e of direct) {
    const r = resolveTransition(e.fromClipId, e.toClipId, graph);
    assert.equal(r.edge?.id, e.id, `edge ${e.id}`);
    assert.equal(r.isFallback, false, `edge ${e.id}`);
  }
});
