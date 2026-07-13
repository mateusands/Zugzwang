export type EngineColor = 'white' | 'black';

export type Score =
  { type: 'cp'; value: number } | { type: 'mate'; movesToMate: number; winner: EngineColor };

export interface EvaluationLine {
  score: Score;
  winPercent: number;
  bestMove: string | null;
  depth: number;
}

export interface PositionEvaluation extends EvaluationLine {
  nodes: number;
  timeMs: number;
  nps: number;
  secondLine: EvaluationLine | null;
}

export type AnalysisProfile = 'fast' | 'deep' | 'maximum';
export type AnalysisJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AnalysisItemRequest {
  key: string;
  fen: string;
  multiPv: 1 | 2;
}

export interface AnalysisJobRequest {
  profile: AnalysisProfile;
  items: AnalysisItemRequest[];
}

export interface AnalysisJobSnapshot {
  id: string;
  status: AnalysisJobStatus;
  profile: AnalysisProfile;
  engine: string;
  progress: { done: number; total: number };
  results: Record<string, PositionEvaluation>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisQuality {
  depth: number;
  multiPv: 1 | 2;
}
