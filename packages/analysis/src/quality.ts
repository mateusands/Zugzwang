import type {
  AnalysisJobRequest,
  AnalysisItemRequest,
  AnalysisProfile,
  AnalysisQuality,
} from './types.js';

const PROFILE_DEPTH: Record<AnalysisProfile, number> = {
  fast: 18,
  deep: 22,
  maximum: 26,
};

const MAX_ITEMS = 256;

export function analysisProfileDepth(profile: AnalysisProfile): number {
  return PROFILE_DEPTH[profile];
}

export function cacheSatisfies(cached: AnalysisQuality, requested: AnalysisQuality): boolean {
  return cached.depth >= requested.depth && cached.multiPv >= requested.multiPv;
}

function isProfile(value: unknown): value is AnalysisProfile {
  return value === 'fast' || value === 'deep' || value === 'maximum';
}

function isFen(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 160) return false;
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 6 || (fields[1] !== 'w' && fields[1] !== 'b')) return false;
  const [board, , castling, enPassant, halfmove, fullmove] = fields;
  if (
    !board ||
    !castling ||
    !enPassant ||
    !halfmove ||
    !fullmove ||
    !/^(?:-|K?Q?k?q?)$/.test(castling) ||
    !/^(?:-|[a-h][36])$/.test(enPassant) ||
    !/^\d+$/.test(halfmove) ||
    !/^[1-9]\d*$/.test(fullmove)
  ) {
    return false;
  }
  const ranks = board.split('/');
  if (ranks.length !== 8) return false;
  let whiteKings = 0;
  let blackKings = 0;
  for (const rank of ranks) {
    let files = 0;
    for (const symbol of rank) {
      if (/^[1-8]$/.test(symbol)) files += Number(symbol);
      else if (/^[prnbqkPRNBQK]$/.test(symbol)) files += 1;
      else return false;
      if (symbol === 'K') whiteKings += 1;
      if (symbol === 'k') blackKings += 1;
    }
    if (files !== 8) return false;
  }
  return whiteKings === 1 && blackKings === 1;
}

function parseItem(value: unknown): AnalysisItemRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.key !== 'string' ||
    item.key.length === 0 ||
    item.key.length > 100 ||
    !isFen(item.fen) ||
    (item.multiPv !== 1 && item.multiPv !== 2)
  ) {
    return null;
  }
  return { key: item.key, fen: item.fen, multiPv: item.multiPv };
}

export function parseAnalysisJobRequest(value: unknown): AnalysisJobRequest | null {
  if (typeof value !== 'object' || value === null) return null;
  const request = value as Record<string, unknown>;
  if (
    !isProfile(request.profile) ||
    !Array.isArray(request.items) ||
    request.items.length === 0 ||
    request.items.length > MAX_ITEMS
  ) {
    return null;
  }

  const items: AnalysisItemRequest[] = [];
  const keys = new Set<string>();
  for (const valueItem of request.items) {
    const item = parseItem(valueItem);
    if (!item || keys.has(item.key)) return null;
    keys.add(item.key);
    items.push(item);
  }
  return { profile: request.profile, items };
}
