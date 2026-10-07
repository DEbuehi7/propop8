export interface PerformanceRun {
  id: string;
  trackId: string;
  dancerId: string;
  engineVersion: string;
  analysisProfileId: string;
  mappingBundleVersion: number;
  transitionGraphVersion: number;
  runtimePolicyVersion: number;
  startedAt: string;
  completedAt?: string;
  avgSync: number;
  avgConfidence: number;
  decisionCount: number;
  transitionCount: number;
  failedTransitionCount: number;
  fallbackCount: number;
  deferCount: number;
  escalationCount: number;
  killCount: number;
  repeatCount: number;
  userSkipCount: number;
  userReplayCount: number;
  completed: boolean;
}
