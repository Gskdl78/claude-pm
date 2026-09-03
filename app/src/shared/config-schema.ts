import type { AppConfig } from './types';

export const MODEL_OPTIONS = ['opus', 'fable', 'sonnet'] as const;
export type ModelName = typeof MODEL_OPTIONS[number];

export const LIMITS = {
  maxRetries: { min: 1, max: 10, default: 3 },
  termFontSize: { min: 10, max: 24, default: 14 },
  logHeight: { min: 60, max: 600, default: 160 },
} as const;

export interface Settings {
  implModel: ModelName;
  reviewModel: ModelName;
  maxRetries: number;
  termFontSize: number;
  logHeight: number;
  notifyOnIdle: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  implModel: 'opus', reviewModel: 'fable',
  maxRetries: LIMITS.maxRetries.default, termFontSize: LIMITS.termFontSize.default, logHeight: LIMITS.logHeight.default,
  notifyOnIdle: true,
};

export type ConfigPatch = Partial<Settings>;

type NumField = keyof typeof LIMITS;

function isModel(v: unknown): v is ModelName { return typeof v === 'string' && (MODEL_OPTIONS as readonly string[]).includes(v); }
function inRange(v: unknown, f: NumField): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= LIMITS[f].min && v <= LIMITS[f].max;
}

/** 任何 JSON → 完整 AppConfig：缺欄位補預設，型別不對或超界的欄位各自退回預設。 */
export function normalizeConfig(raw: unknown, base: AppConfig): AppConfig {
  if (!raw || typeof raw !== 'object') return { ...base };
  const r = raw as Record<string, unknown>;
  return {
    root: typeof r.root === 'string' && r.root ? r.root : base.root,
    lastProject: typeof r.lastProject === 'string' ? r.lastProject : null,
    recent: Array.isArray(r.recent) ? r.recent.filter((x): x is string => typeof x === 'string') : [],
    implModel: isModel(r.implModel) ? r.implModel : base.implModel,
    reviewModel: isModel(r.reviewModel) ? r.reviewModel : base.reviewModel,
    maxRetries: inRange(r.maxRetries, 'maxRetries') ? r.maxRetries : base.maxRetries,
    termFontSize: inRange(r.termFontSize, 'termFontSize') ? r.termFontSize : base.termFontSize,
    logHeight: inRange(r.logHeight, 'logHeight') ? r.logHeight : base.logHeight,
    notifyOnIdle: typeof r.notifyOnIdle === 'boolean' ? r.notifyOnIdle : base.notifyOnIdle,
  };
}

/** renderer 傳來的 patch 是不可信輸入：只收白名單欄位，值必須在範圍內；未知欄位忽略。 */
export function validatePatch(v: unknown): ConfigPatch {
  if (!v || typeof v !== 'object') throw new Error('invalid patch');
  const p = v as Record<string, unknown>;
  const out: ConfigPatch = {};
  if ('implModel' in p) { if (!isModel(p.implModel)) throw new Error('invalid implModel'); out.implModel = p.implModel; }
  if ('reviewModel' in p) { if (!isModel(p.reviewModel)) throw new Error('invalid reviewModel'); out.reviewModel = p.reviewModel; }
  for (const f of ['maxRetries', 'termFontSize', 'logHeight'] as const) {
    if (f in p) { if (!inRange(p[f], f)) throw new Error(`invalid ${f}`); out[f] = p[f]; }
  }
  if ('notifyOnIdle' in p) { if (typeof p.notifyOnIdle !== 'boolean') throw new Error('invalid notifyOnIdle'); out.notifyOnIdle = p.notifyOnIdle; }
  return out;
}
