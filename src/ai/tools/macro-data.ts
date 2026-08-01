import "server-only";

import type { FinancialTool, ToolResult } from "./types";
import { seededValue, SIMULATED_DATA_NOTE } from "./mock-utils";

// ── MacroDataTool（Phase 3.4）───────────────────────────────────────────────
// 能力：利率、汇率、通胀、GDP 等宏观经济指标。
// 第一階段：Mock Adapter（确定性数据，锚定近期中国市场常态区间）。真实 API 见底部注释。

interface MacroIndicators {
  country: string;
  lpr1y: number; // 贷款市场报价利率 1 年期 %
  lpr5y: number; // 5 年期以上 %
  rrr: number; // 存款准备金率 %
  usdcny: number; // 美元兑人民币
  cnyIndex10y: number; // 10 年期国债收益率 %
  cpiYoY: number; // CPI 同比 %
  ppiYoY: number; // PPI 同比 %
  gdpYoY: number; // GDP 同比 %
  pmi: number; // 制造业 PMI
}

function buildMacro(country: string): MacroIndicators {
  if (country === "US") {
    return {
      country,
      lpr1y: seededValue("US-fed", 4.5, 5.5),
      lpr5y: seededValue("US-fed30", 4.5, 5.5),
      rrr: 0,
      usdcny: seededValue("USDX", 100, 105),
      cnyIndex10y: seededValue("US-10y", 3.8, 4.6),
      cpiYoY: seededValue("US-cpi", 2.5, 4),
      ppiYoY: seededValue("US-ppi", 0.5, 3),
      gdpYoY: seededValue("US-gdp", 1.5, 3),
      pmi: seededValue("US-pmi", 47, 53),
    };
  }
  // 默认中国（CN）
  return {
    country,
    lpr1y: seededValue("CN-lpr1y", 3.0, 3.6),
    lpr5y: seededValue("CN-lpr5y", 3.8, 4.2),
    rrr: seededValue("CN-rrr", 7.0, 9.0),
    usdcny: seededValue("CN-usdcny", 7.0, 7.3),
    cnyIndex10y: seededValue("CN-10y", 2.1, 2.5),
    cpiYoY: seededValue("CN-cpi", 0.1, 1.2),
    ppiYoY: seededValue("CN-ppi", -2.5, 0.5),
    gdpYoY: seededValue("CN-gdp", 4.5, 5.5),
    pmi: seededValue("CN-pmi", 49, 51.5),
  };
}

function formatMacro(m: MacroIndicators): string {
  return [
    `- 政策利率：1年期 LPR ${m.lpr1y}%，5年期以上 LPR ${m.lpr5y}%`,
    `- 存款准备金率：${m.rrr}%`,
    `- 汇率：美元兑人民币 ${m.usdcny}`,
    `- 10年期国债收益率：${m.cnyIndex10y}%`,
    `- CPI 同比：${m.cpiYoY}%，PPI 同比：${m.ppiYoY}%`,
    `- GDP 同比：${m.gdpYoY}%，制造业 PMI：${m.pmi}`,
  ].join("\n");
}

class MacroDataToolImpl implements FinancialTool {
  name = "MacroDataTool";
  label = "宏观经济数据";
  description = "提供利率、汇率、通胀与经济增长等宏观经济指标";

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const country =
        typeof params.country === "string" && params.country ? params.country : "CN";
      const m = buildMacro(country);
      return {
        status: "success",
        summary: `${SIMULATED_DATA_NOTE}\n宏观经济指标（${country}）：\n${formatMacro(m)}`,
        data: { macro: m },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "宏观数据获取失败";
      return { status: "error", summary: `宏观数据获取失败：${message}`, error: message };
    }
  }
}

/**
 * 真实 API 接入点（未来替换 Mock）：
 *   const res = await fetch(`https://api.finos-macro.example/indicators?country=${country}`, {
 *     headers: { Authorization: `Bearer ${process.env.MACRO_API_KEY}` },
 *   });
 *   const m = (await res.json()).data; // 映射到 MacroIndicators 结构
 */
export const macroDataTool = new MacroDataToolImpl();
