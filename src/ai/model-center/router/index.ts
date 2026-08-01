import "server-only";

/**
 * 用户模型路由（Phase 5.5 九）。
 * 在用户已配置的多个模型中，按任务类型选择最合适的模型。
 * 逻辑：
 *   1. 若用户为某任务角色（reasoning/vision/long-context）配置了专用模型 → 用之；
 *   2. 否则回退到默认模型（isDefault）。
 * 与内置 ModelRouter（env 层）区别：本 Router 只在用户配置范围内选择，
 * 保证「完全模型无关」——系统绝不引入任何官方模型。
 */

import { modelConfigStore } from "../models/store";
import type { ResolvedModel } from "../providers/OpenAICompatibleProvider";
import type { AIProviderConfig, ModelRole } from "../types";
import type { TaskType } from "../../types";
import { getPreset } from "../providers/presets";

/** TaskType → 首选模型角色。 */
const TASK_ROLE: Record<TaskType, ModelRole> = {
  reasoning: "reasoning",
  planning: "reasoning",
  analysis: "chat",
  writing: "chat",
  summarization: "chat",
  extraction: "chat",
  vision: "vision",
  "long-context": "long-context",
};

function toResolved(config: AIProviderConfig): ResolvedModel | null {
  const preset = getPreset(config.providerType);
  const apiKey = modelConfigStore.decryptKey(config);
  if (preset.requiresKey && !apiKey) return null;
  if (!config.baseUrl || !config.modelId) return null;
  return {
    providerType: config.providerType,
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    apiKey,
    modelId: config.modelId,
    displayName: config.displayName,
  };
}

class UserModelRouter {
  /**
   * 为指定任务在用户模型中路由。
   * @returns ResolvedModel 或 null（用户未配置任何可用模型）。
   */
  async route(userId: string, taskType?: TaskType): Promise<ResolvedModel | null> {
    const configs = await modelConfigStore.getDefaultRaw(userId)
      ? await this.allRaw(userId)
      : [];
    if (configs.length === 0) return null;

    // 1. 任务专用角色匹配
    if (taskType) {
      const wantRole = TASK_ROLE[taskType];
      const roleMatch = configs.find((c) => c.roles?.includes(wantRole));
      if (roleMatch) {
        const r = toResolved(roleMatch);
        if (r) return r;
      }
    }
    // 2. 默认模型
    const def =
      configs.find((c) => c.isDefault) ??
      configs.find((c) => c.status === "online") ??
      configs[0];
    return def ? toResolved(def) : null;
  }

  private async allRaw(userId: string): Promise<AIProviderConfig[]> {
    // 复用 store 的解密缓存：list 返回 public，这里改用内部 getRaw 遍历。
    const publicList = await modelConfigStore.list(userId);
    const raws: AIProviderConfig[] = [];
    for (const p of publicList) {
      const raw = await modelConfigStore.getRaw(userId, p.id);
      if (raw) raws.push(raw);
    }
    return raws;
  }
}

export const userModelRouter = new UserModelRouter();
