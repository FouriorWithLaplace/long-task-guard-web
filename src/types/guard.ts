export interface SessionSummary {
  id: string;
  title: string;
  projectPath: string;
}

export interface GuardSettings {
  sessionId: string;
  model: string;
  reasoning: string;
  startMessage: string;
  retryMessage: string;
  completeMessage: string;
}

export type GuardPhase = "paused" | "starting" | "running" | "waiting" | "needsInput" | "stopping";
export type GuardActivityStatus = "running" | "completed" | "failed" | "declined" | "interrupted" | "ended";

export interface GuardLog {
  id: number;
  time: string;
  kind: "status" | "message" | "error";
  role: "system" | "user" | "assistant" | "tool";
  text: string;
  itemKey?: string;
  activityStatus?: GuardActivityStatus;
}

export interface GuardQuestion {
  id: string;
  question: string;
  secret: boolean;
  options: string[];
}

export interface GuardRequest {
  id: string | number;
  kind: "approval" | "input";
  title: string;
  detail: string;
  questions: GuardQuestion[];
}

export interface GuardSnapshot {
  instanceId: string;
  revision: number;
  runId: number;
  phase: GuardPhase;
  settings: GuardSettings | null;
  sessionTitle: string;
  projectPath: string;
  turnId: string | null;
  nextMessage: "complete" | "retry" | null;
  requests: GuardRequest[];
  logs: GuardLog[];
}
