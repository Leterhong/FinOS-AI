/**
 * VectorStore 工厂（Phase 6.6，用户需求四）。
 *
 * 通过环境变量 FINOS_VECTOR_BACKEND 选择后端，默认 local。
 * FAISS / Chroma / pgvector 为预留接入位：接入时新增对应适配器文件，
 * 在 switch 中补分支即可，上层（retriever / pipeline）零改动。
 */
import "server-only";

import type { VectorStore, VectorStoreBackend } from "../types";
import { LocalVectorStore } from "./local";

let storeSingleton: VectorStore | null = null;

function resolveBackend(): VectorStoreBackend {
  const env = (process.env.FINOS_VECTOR_BACKEND ?? "local").toLowerCase();
  if (env === "faiss" || env === "chroma" || env === "pgvector") return env;
  return "local";
}

export function createVectorStore(): VectorStore {
  if (storeSingleton) return storeSingleton;
  const backend = resolveBackend();
  switch (backend) {
    case "faiss":
    case "chroma":
    case "pgvector":
      // 预留：对应适配器落地前回退 local，保证系统可用
      console.warn(
        `[knowledge] vector backend "${backend}" 尚未接入，回退 LocalVectorStore`
      );
      storeSingleton = new LocalVectorStore();
      break;
    case "local":
    default:
      storeSingleton = new LocalVectorStore();
      break;
  }
  return storeSingleton;
}

export { LocalVectorStore } from "./local";
