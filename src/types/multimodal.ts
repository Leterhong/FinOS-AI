/**
 * Phase 7.2 多模态识别录入 —— 强类型契约。
 * 字段命名对齐后端 `backend/multimodal/*`（camelCase 返回）。
 */

export type Modality = "text" | "image" | "audio" | "document";

export type ExtractionKind =
  | "asset"
  | "liability"
  | "income"
  | "expense"
  | "goal"
  | "profile";

export type ExtractionStatus = "needs_confirm" | "confirmed" | "rejected";

/** 单条识别提取结果（待用户确认后才写入财富分身）。 */
export interface Extraction {
  id: string;
  inputId: string;
  kind: ExtractionKind;
  label: string;
  assetType?: string;
  amount: number;
  currency?: string;
  occurredAt?: string;
  confidence: number;
  evidence?: string;
  payload?: Record<string, unknown>;
  status: ExtractionStatus;
  applied: boolean;
  createdAt?: string;
}

/** 一次多模态摄入记录（含其下提取结果）。 */
export interface MultimodalInput {
  id: string;
  modality: string;
  subtype?: string;
  filename?: string;
  mime?: string;
  sizeBytes?: number;
  summary?: string;
  tier?: string;
  status: string;
  error?: string;
  createdAt?: string;
  extractions: Extraction[];
}

export interface MultimodalCapabilities {
  modalities: string[];
  image: { compress: boolean; ocr: boolean };
  audio: { serverStt: boolean; clientStt: boolean };
  document: {
    pdf: boolean;
    xlsx: boolean;
    docx: boolean;
    native: string[];
  };
  confirmRequired: boolean;
  disclaimer: string;
}

/** 文本 / 图片 / 文件识别的统一返回（needs_confirm 铁律）。 */
export interface IngestResult {
  inputId: string;
  needsConfirm: boolean;
  extractions: Extraction[];
  note?: string;
  summary?: string;
  tier?: string;
  subtype?: string;
  rawText?: string;
  // 欢迎态（无数据）
  hasData?: boolean;
  welcome?: string;
}

/** 语音识别返回。 */
export interface SpeechResult {
  ok: boolean;
  transcript?: string;
  entities?: unknown[];
  inputId?: string;
  extractions?: Extraction[];
  needsConfirm?: boolean;
  message?: string;
  hasData?: boolean;
  welcome?: string;
}

export interface PendingResult {
  items: Extraction[];
  count: number;
}

export interface ConfirmEdit {
  amount?: number;
  label?: string;
  assetType?: string;
  kind?: ExtractionKind;
}

export interface ConfirmBody {
  ids: string[];
  edits?: Record<string, ConfirmEdit>;
}

/** confirm 返回的写入结果（含资产/画像变更计数）。 */
export interface ConfirmResult {
  applied: number;
  message?: string;
  assetsAdded?: number;
  hasData?: boolean;
  welcome?: string;
  [key: string]: unknown;
}

export interface InputsResult {
  items: MultimodalInput[];
  hasData: boolean;
  welcome?: string;
}
