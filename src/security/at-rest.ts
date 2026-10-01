import "server-only";

/**
 * 通用「静态数据加密」助手：把任意 JSON 序列化对象以 AES-256-GCM 落盘，
 * 并兼容读取历史明文文件（自动识别，无需一次性迁移即可平滑升级）。
 *
 * 密钥来源与模型中心一致：FINOS_DATA_KEY（scrypt 派生）。
 */
import { decryptJson, encryptJson } from "@/financial-data/storage/crypto";
import type { EncryptedBlob } from "@/financial-data/types";

/** 序列化为密文字符串（含 alg 标记，便于读取时识别）。 */
export function encodeAtRest<T>(value: T): string {
  return JSON.stringify(encryptJson(value));
}

/** 读取字符串：密文则解密，历史明文则原样解析；任何异常返回 fallback。 */
export function decodeAtRest<T>(raw: string, fallback: T): T {
  const text = (raw || "").trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && "alg" in parsed && "iv" in parsed) {
      return decryptJson<T>(parsed as EncryptedBlob);
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}
