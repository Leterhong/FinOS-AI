/**
 * 用户财务资料文档类型（Financial Twin 6.x，需求三）。
 * 支持 PDF / Excel / CSV / 图片，按 userId 隔离存储，供后续 RAG 财务分析使用。
 */

/** 文档业务分类（用于后续 RAG 检索分区）。 */
export type DocumentCategory =
  | "salary" // 工资流水
  | "asset_proof" // 资产证明
  | "investment" // 投资记录
  | "other";

/** 允许上传的文件类型白名单。 */
export const ALLOWED_DOC_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "text/csv": [".csv"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

/** 单文件大小上限：10MB。 */
export const MAX_DOC_SIZE = 10 * 1024 * 1024;

/** 文档元数据记录（index.json 条目）。 */
export interface DocumentMeta {
  /** 文档 ID（生成）。 */
  id: string;
  /** 所属用户。 */
  userId: string;
  /** 原始文件名（展示用）。 */
  fileName: string;
  /** 存储文件名（id + 扩展名，防注入）。 */
  storedName: string;
  /** MIME 类型。 */
  mimeType: string;
  /** 文件大小（字节）。 */
  size: number;
  /** 业务分类。 */
  category: DocumentCategory;
  /** 上传时间（epoch ms）。 */
  uploadedAt: number;
  /** RAG 处理状态（预留：uploaded = 待解析）。 */
  ragStatus: "uploaded" | "parsed" | "indexed";
}
