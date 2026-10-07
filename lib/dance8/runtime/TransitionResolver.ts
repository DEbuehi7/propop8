import type { TransitionGraph, TransitionEdge } from "../contracts/transition";

export interface TransitionResolution {
  edge: TransitionEdge | null;
  isFallback: boolean;
  reason: string;
}

/**
 * Attempts to resolve a transition from source to target clip.
 * If normal edge is incompatible/missing, falls back to safe fallback edge.
 */
export function resolveTransition(
  sourceClipId: string,
  targetClipId: string,
  graph: TransitionGraph
): TransitionResolution {
  // The ordinary (non-fallback) edge for this pair, if the graph has one.
  const directEdge = graph.edges.find(
    (e) => e.fromClipId === sourceClipId && e.toClipId === targetClipId && !e.fallbackOnly
  );

  if (directEdge && directEdge.compatible !== false) {
    return { edge: directEdge, isFallback: false, reason: "direct edge found" };
  }

  // Direct edge is missing or marked incompatible: use the safe fallback
  // from the same source clip, if one exists.
  const fallbackEdge = graph.edges.find(
    (e) => e.fromClipId === sourceClipId && e.fallbackOnly && e.compatible !== false
  );

  if (fallbackEdge) {
    return {
      edge: fallbackEdge,
      isFallback: true,
      reason: directEdge
        ? "direct edge incompatible, using fallback"
        : "direct edge missing, using fallback",
    };
  }

  return { edge: null, isFallback: false, reason: "no edge found" };
}

/**
 * Computes transition cost for a resolution.
 * Normal edge: use its cost. Fallback or missing: return max cost + 0.3.
 */
export function resolveTransitionCost(
  resolution: TransitionResolution,
  transitionMaxCost: number
): number {
  if (resolution.edge && !resolution.isFallback) {
    return resolution.edge.cost ?? 0;
  }
  if (resolution.edge && resolution.isFallback) {
    return transitionMaxCost + 0.3;
  }
  return transitionMaxCost + 0.3;
}

/**
 * Checks if a transition from source to target is possible (not explicitly incompatible).
 */
export function canTransition(
  sourceClipId: string,
  targetClipId: string,
  graph: TransitionGraph
): boolean {
  const resolution = resolveTransition(sourceClipId, targetClipId, graph);
  return resolution.edge !== null;
}

/**
 * Resolves a transition and returns full information for tracing.
 */
export function resolveTransitionForTrace(
  sourceClipId: string,
  targetClipId: string,
  graph: TransitionGraph,
  transitionMaxCost: number
): {
  targetClipId: string;
  isFallback: boolean;
  cost: number;
  reason: string;
} {
  const resolution = resolveTransition(sourceClipId, targetClipId, graph);
  const cost = resolveTransitionCost(resolution, transitionMaxCost);

  return {
    targetClipId,
    isFallback: resolution.isFallback,
    cost,
    reason: resolution.reason,
  };
}
