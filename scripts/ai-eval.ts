import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { scoreExtraction, type EvalCase, type EvalPredictedFact } from "../src/lib/ai-eval-score";

/**
 * AI 事实抽取真实评测：用共享/自配模型跑标注集，产出准确率、召回、单位正确率与引用有效性。
 * 需要模型环境变量：AI_BASE_URL / AI_MODEL / AI_API_KEY（可从 .data/ai-model.env 加载）。
 * 运行：npm run ai-eval
 */

const baseUrl = (process.env.AI_BASE_URL ?? "").trim().replace(/\/+$/, "");
const model = (process.env.AI_MODEL ?? "").trim();
const apiKey = (process.env.AI_API_KEY ?? "").trim();
if (!baseUrl || !model || !apiKey) {
  console.error("缺少 AI_BASE_URL / AI_MODEL / AI_API_KEY，无法运行真实评测。");
  process.exit(2);
}

const cases = JSON.parse(readFileSync(join(process.cwd(), "tests", "eval", "extraction-cases.json"), "utf8")) as EvalCase[];

const SYSTEM_PROMPT =
  "你是企业金融资料的事实抽取引擎。只从给定文本抽取明确出现的事实，禁止推断或补充。只输出 JSON：" +
  '{"facts":[{"topic":"指标名","value":数值,"unit":"单位","quote":"原文片段"}]}。' +
  "否定表述（如“无对外担保”“未发生诉讼”“不存在”）不构成数值事实，不要抽取；找不到事实时返回 {\"facts\":[]}。";

function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function predict(text: string): Promise<EvalPredictedFact[]> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `【文本】\n${text}` },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) as { facts?: Array<Record<string, unknown>> } | null;
  const facts = Array.isArray(parsed?.facts) ? parsed!.facts : [];
  return facts
    .map((fact) => ({ topic: String(fact.topic ?? ""), value: Number(fact.value), unit: String(fact.unit ?? ""), quote: String(fact.quote ?? "") }))
    .filter((fact) => fact.topic && Number.isFinite(fact.value));
}

async function main(): Promise<void> {
  const predictions = [];
  const failures: string[] = [];
  for (const evalCase of cases) {
    try {
      predictions.push({ id: evalCase.id, facts: await predict(evalCase.text) });
    } catch (error) {
      failures.push(`${evalCase.id}: ${error instanceof Error ? error.message : String(error)}`);
      predictions.push({ id: evalCase.id, facts: [] });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const metrics = scoreExtraction(cases, predictions);
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  const lines: string[] = [];
  lines.push("# FinOS AI · 事实抽取真实评测");
  lines.push("");
  lines.push("> 本报告由 `npm run ai-eval` 生成：用配置的模型对标注集做事实抽取，统计精确率/召回率/F1、单位正确率与引用有效性。");
  lines.push("");
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push(`模型：${model}`);
  lines.push(`标注用例：${metrics.cases} 条 · 期望事实 ${metrics.expectedTotal} 条 · 预测事实 ${metrics.predictedTotal} 条`);
  lines.push("");
  lines.push("## 总览");
  lines.push("");
  lines.push("| 指标 | 数值 | 说明 |");
  lines.push("| --- | --- | --- |");
  lines.push(`| 精确率 Precision | ${pct(metrics.precision)} | 预测事实中与期望一致的比例 |`);
  lines.push(`| 召回率 Recall | ${pct(metrics.recall)} | 期望事实中被正确抽取的比例 |`);
  lines.push(`| F1 | ${pct(metrics.f1)} | 精确率与召回率的调和平均 |`);
  lines.push(`| 单位正确率 | ${pct(metrics.unitCorrectRate)} | 匹配事实中单位一致的比例 |`);
  lines.push(`| 引用有效性 | ${pct(metrics.citationValidRate)} | 预测事实原文引用可在原文定位的比例（幻觉代理指标） |`);
  lines.push("");
  lines.push("## 逐条结果");
  lines.push("");
  lines.push("| 用例 | TP | FP | FN | 缺失主题 |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const item of metrics.perCase) {
    lines.push(`| ${item.id} | ${item.truePositive} | ${item.falsePositive} | ${item.falseNegative} | ${item.missingTopics.join("、") || "-"} |`);
  }
  lines.push("");
  lines.push("## 方法");
  lines.push("");
  lines.push("- 指标口径：主题经语义别名归一化后比较，数值相对误差 2% 内视为一致；单位按文本口径精确比较。");
  lines.push("- 引用有效性：预测事实的 quote 去除空白与标点后必须能在原文找到，用于衡量「编造证据」的程度。");
  lines.push("- 本评测调用真实模型，不依赖人工评分；每轮生成结果可复现，模型或提示词变化会反映到数字。");
  lines.push("");
  if (failures.length) {
    lines.push("## 失败调用");
    lines.push("");
    for (const failure of failures) lines.push(`- ${failure}`);
    lines.push("");
  }

  writeFileSync(join(process.cwd(), "docs", "ai-eval.md"), lines.join("\n"), "utf8");
  console.log(`ai-eval: P=${pct(metrics.precision)} R=${pct(metrics.recall)} F1=${pct(metrics.f1)} 单位=${pct(metrics.unitCorrectRate)} 引用=${pct(metrics.citationValidRate)} -> docs/ai-eval.md`);
  if (failures.length) console.error(`失败调用 ${failures.length} 条：\n${failures.join("\n")}`);
}

void main();

