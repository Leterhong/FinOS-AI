import "server-only";

import type { FinancialTool, ToolResult } from "./types";
import { seededValue, seededChange, SIMULATED_DATA_NOTE } from "./mock-utils";

// ── FundDataTool（Phase 3.4）────────────────────────────────────────────────
// 能力：基金信息、净值、收益与风险指标。
// 第一階段：Mock Adapter（确定性数据）。真实 API 接入点见文件底部注释。

interface FundInfo {
  code: string;
  name: string;
  type: string; // 股票型 / 混合型 / 债券型 / 指数型
  nav: number; // 单位净值
  dailyChangePct: number;
  return1y: number; // 近 1 年收益 %
  return3y: number; // 近 3 年年化 %
  maxDrawdown: number; // 最大回撤 %
}

const DEFAULT_FUNDS: { code: string; name: string; type: string }[] = [
  { code: "110011", name: "易方达优质精选混合", type: "混合型" },
  { code: "161725", name: "招商中证白酒指数", type: "指数型" },
  { code: "005827", name: "易方达蓝筹精选混合", type: "混合型" },
  { code: "003095", name: "中欧医疗健康混合", type: "股票型" },
];

function formatFunds(funds: FundInfo[]): string {
  return funds
    .map(
      (f) =>
        `- ${f.name}（${f.code}，${f.type}）：净值 ${f.nav.toFixed(4)}，今日 ${f.dailyChangePct >= 0 ? "+" : ""}${f.dailyChangePct}%，近1年 ${f.return1y >= 0 ? "+" : ""}${f.return1y}%，近3年年化 ${f.return3y >= 0 ? "+" : ""}${f.return3y}%，最大回撤 ${f.maxDrawdown}%`
    )
    .join("\n");
}

class FundDataToolImpl implements FinancialTool {
  name = "FundDataTool";
  label = "基金数据";
  description = "提供公募基金净值、阶段收益与风险指标";

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const codes = Array.isArray(params.codes)
        ? (params.codes as string[])
        : DEFAULT_FUNDS.map((f) => f.code);

      const funds: FundInfo[] = codes.map((code) => {
        const meta = DEFAULT_FUNDS.find((f) => f.code === code);
        const name = meta?.name ?? code;
        const type = meta?.type ?? "混合型";
        const nav = seededValue(`${code}-nav`, 1, 4);
        const dailyChangePct = seededChange(`${code}-d`, 3);
        const return1y = seededValue(`${code}-1y`, -15, 35);
        const return3y = seededValue(`${code}-3y`, -5, 18);
        const maxDrawdown = seededValue(`${code}-dd`, 12, 42) * -1;
        return { code, name, type, nav, dailyChangePct, return1y, return3y, maxDrawdown };
      });

      const summaryLines = formatFunds(funds);
      return {
        status: "success",
        summary: `${SIMULATED_DATA_NOTE}\n基金数据（${funds.length} 只）：\n${summaryLines}`,
        data: { funds },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "基金数据获取失败";
      return { status: "error", summary: `基金数据获取失败：${message}`, error: message };
    }
  }
}

/**
 * 真实 API 接入点（未来替换 Mock）：
 *   const res = await fetch(`https://api.finos-fund.example/fund?codes=${codes.join(",")}`, {
 *     headers: { Authorization: `Bearer ${process.env.FUND_API_KEY}` },
 *   });
 *   const funds = (await res.json()).data; // 映射到 FundInfo 结构
 */
export const fundDataTool = new FundDataToolImpl();
