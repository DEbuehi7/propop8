export interface TransitionEdge {
  id: string;
  fromClipId: string;
  toClipId: string;
  cost: number; // 0..1
  blendMs: number;
  compatible: boolean;
  bridgeClipId?: string;
  reason?: string;
  /** Excluded from normal optimization; used only after ordinary resolution fails. */
  fallbackOnly?: boolean;
}

export interface TransitionGraph {
  id: string;
  schemaVersion: 1;
  version: number;
  dancerFamily: string;
  edges: TransitionEdge[];
}
