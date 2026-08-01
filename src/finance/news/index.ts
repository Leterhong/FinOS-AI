import "server-only";

/**
 * 金融新闻系统（Phase 6.9 需求九）。
 *  - News Provider 路由：使用具备 news 能力的数据源（如 custom）。
 *  - 结合用户持仓：标记 related；重大新闻 + 关联持仓 → 写入通知中心（AI 提醒）。
 *  - 无新闻数据源 → 返回空列表 + 可行动提示（绝不伪造新闻）。
 */

import { financeDb } from "@/financial-data/storage";
import {
  proactiveStore,
  newNotificationId,
  applyNotificationPolicy,
} from "@/ai/proactive/notification";
import type { ProactiveNotification } from "@/ai/proactive/types";
import type { FinanceNewsItem } from "../types";
import { resolveProvidersFor, normalizeSymbol } from "../providers";

export interface NewsFeedResult {
  items: Array<FinanceNewsItem & { related?: boolean; relatedHolding?: string }>;
  dataStatus: "live" | "none";
  dataNotice?: string;
  /** 本次触发的持仓关联提醒数 */
  alertsPushed: number;
}

/** 用户持仓代码 → 名称映射（股票代码归一化） */
function holdingSymbolMap(userId: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of financeDb.getHoldings(userId)) {
    if (!h.code) continue;
    if (h.type === "stock") map.set(normalizeSymbol(h.code), h.name);
    else map.set(h.code.replace(/\D/g, "") || h.code, h.name);
  }
  return map;
}

/**
 * 获取用户新闻流（结合持仓关联 + 重大新闻提醒）。
 */
export async function getNewsForUser(
  userId: string,
  opts: { limit?: number } = {},
): Promise<NewsFeedResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const holdingMap = holdingSymbolMap(userId);
  const providers = await resolveProvidersFor(userId, "news");

  if (providers.length === 0) {
    return {
      items: [],
      dataStatus: "none",
      dataNotice:
        "尚未配置支持新闻的数据源。可在「设置 → 金融数据源」添加自定义数据源以获取市场 / 公司 / 行业新闻。",
      alertsPushed: 0,
    };
  }

  let items: FinanceNewsItem[] = [];
  const errors: string[] = [];
  for (const { provider } of providers) {
    try {
      if (!provider.getNews) continue;
      items = await provider.getNews({
        symbols: [...holdingMap.keys()],
        limit,
      });
      break;
    } catch (e) {
      errors.push(`${provider.label}: ${(e as Error).message}`);
    }
  }

  if (items.length === 0 && errors.length > 0) {
    return {
      items: [],
      dataStatus: "none",
      dataNotice: `新闻数据源暂时不可用：${errors[0]}`,
      alertsPushed: 0,
    };
  }

  // 持仓关联标记
  const enriched = items.slice(0, limit).map((n) => {
    let related = false;
    let relatedHolding: string | undefined;
    for (const sym of n.symbols ?? []) {
      const key = /^\d+$/.test(sym) ? sym : normalizeSymbol(sym);
      const name = holdingMap.get(key) ?? holdingMap.get(sym);
      if (name) {
        related = true;
        relatedHolding = name;
        break;
      }
    }
    return { ...n, related, relatedHolding };
  });

  // 重大新闻 + 关联持仓 → 通知中心（复用 Policy + 24h 去重）
  const candidates: ProactiveNotification[] = [];
  const now = Date.now();
  for (const n of enriched) {
    if (n.importance !== "major" || !n.related) continue;
    candidates.push({
      id: newNotificationId(),
      userId,
      category: "risk",
      priority: "high",
      severity: "warn",
      title: `持仓「${n.relatedHolding}」出现重大新闻`,
      reason: `${n.title}${n.summary ? `：${n.summary}` : ""}（来源：${n.source}）`,
      suggestion:
        "请关注该消息对持仓的潜在影响，结合自身判断决策。FinOS AI提供信息分析和辅助决策，不构成投资建议。",
      source: "market-monitor",
      read: false,
      dismissed: false,
      createdAt: now,
    });
  }

  let alertsPushed = 0;
  if (candidates.length > 0) {
    const settings = proactiveStore.getSettings(userId);
    const { accepted } = applyNotificationPolicy(userId, settings, candidates);
    if (accepted.length > 0) {
      proactiveStore.addNotifications(userId, accepted);
      alertsPushed = accepted.length;
    }
  }

  return { items: enriched, dataStatus: "live", alertsPushed };
}
