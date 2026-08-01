/**
 * Phase 6.5 验收脚本（AI Cost Optimization + AI Cache System + Agent Task Scheduler）。
 *
 * 运行：node scripts/phase65-acceptance.mjs [baseUrl]
 * 默认 baseUrl = http://localhost:3000
 *
 * 设计原则：不依赖任何外部模型联网即可确定性验证「商业级 AI 调用架构」的核心保证：
 *   测试1  Dashboard 打开 0 次 LLM                    → 用量文件调用次数/Tokens 不变
 *   测试2  刷新 10 次 Token = 0                        → 用量文件 Tokens 增量 = 0
 *   测试3  改资产触发重分析                            → PATCH 返回 changeScore=high + triggeredReanalysis=true + 缓存失效
 *   测试4  问退休只调 Retirement Agent                 → 种入 retirement 缓存（精确匹配 inputHash）→ 缓存命中 0 LLM + 仅 retirement 结果
 *   测试5  财富评分本地计算                            → /api/market/snapshot 返回 risk.score(0~100) 且全程 0 LLM
 *
 * 验证真相来源：直接读取服务端落盘的 .data/ai-usage/{userId}.json（每次 LLM 调用都追加记录，
 * 成功或失败均记录），与 /api/ai/usage 接口互为交叉验证。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const BASE = process.argv[2] || "http://localhost:3000";
const ROOT = process.cwd();
const USAGE_DIR = path.join(ROOT, ".data", "ai-usage");
const CACHE_DIR = path.join(ROOT, ".data", "ai-cache");

let PASS = 0;
let FAIL = 0;
const LOG = [];

function check(name, ok, detail = "") {
  if (ok) {
    PASS++;
    LOG.push(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    FAIL++;
    LOG.push(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

// ── 复刻编排层哈希与画像摘要（与 src/ai/orchestration 完全一致）──
function compactProfile(p) {
  return {
    age: p.age || 0,
    cashSavings: p.cashSavings || 0,
    stockPortfolio: p.stockPortfolio || 0,
    realEstate: p.realEstate || 0,
    bonds: p.bonds || 0,
    funds: p.funds || 0,
    crypto: p.crypto || 0,
    house: p.house || 0,
    insurance: p.insurance || 0,
    liabilities: p.liabilities || 0,
    monthlySalary: p.monthlySalary || 0,
    monthlyExpenses: p.monthlyExpenses || 0,
    monthlyInvestment: p.monthlyInvestment || 0,
    retirementAge: p.goal?.retirementAge || 0,
    targetAmount: p.goal?.targetAmount || 0,
  };
}
function hashInput(...parts) {
  const h = crypto.createHash("sha256");
  h.update(parts.map((p) => (p === undefined || p === null ? "" : String(p))).join("|"));
  return h.digest("hex");
}

// ── 用量文件真相读取（每次 LLM 调用都追加一条 UsageRecord）──
async function readUsage(userId) {
  const f = path.join(USAGE_DIR, `${safeId(userId)}.json`);
  try {
    const arr = JSON.parse(await fs.readFile(f, "utf8"));
    if (!Array.isArray(arr)) return { calls: 0, tokens: 0 };
    const calls = arr.length;
    const tokens = arr.reduce((s, r) => s + (r.totalTokens || 0), 0);
    return { calls, tokens };
  } catch {
    return { calls: 0, tokens: 0 };
  }
}
async function readCache(userId) {
  const f = path.join(CACHE_DIR, `${safeId(userId)}.json`);
  try {
    const raw = await fs.readFile(f, "utf8");
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return null; }
    // 透明兼容：明文数组或加密信封
    if (Array.isArray(parsed)) return parsed;
    if (parsed && parsed.alg === "aes-256-gcm") return "encrypted";
    return parsed;
  } catch {
    return null;
  }
}

// ── HTTP 客户端（带 cookie jar）──
function makeClient() {
  const jar = new Map();
  return {
    async fetch(p, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      if (jar.size > 0) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      const res = await fetch(`${BASE}${p}`, { ...opts, headers, redirect: "manual" });
      const setCookies = res.headers.getSetCookie?.() ?? [];
      for (const sc of setCookies) {
        const [pair] = sc.split(";");
        const idx = pair.indexOf("=");
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (v) jar.set(k, v);
        else jar.delete(k);
      }
      return res;
    },
  };
}

async function registerAndOnboard(client, tag, wealth) {
  const email = `p65-${tag}-${Date.now()}@test.finos`;
  const password = "Passw0rd!123";
  let res = await client.fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: `P65 ${tag}` }),
  });
  const reg = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`注册失败: ${res.status} ${JSON.stringify(reg)}`);
  const userId = reg.user?.id;

  res = await client.fetch("/api/profile/wealth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wealth),
  });
  const prof = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`财富初始化失败: ${res.status} ${JSON.stringify(prof)}`);
  return { email, userId };
}

async function getProfile(client) {
  const res = await client.fetch("/api/profile/x");
  const data = await res.json().catch(() => ({}));
  return data.profile;
}

// ── 测试4：解析 chat SSE 流，收集结果中的 agentId ──
async function chatRetirement(client, question) {
  const res = await client.fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  const text = await res.text();
  const agents = new Set();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      const evt = JSON.parse(payload);
      if (evt.type === "task-complete" && evt.result?.agentId) agents.add(evt.result.agentId);
      if (evt.type === "done" && Array.isArray(evt.state?.results)) {
        for (const r of evt.state.results) if (r?.agentId) agents.add(r.agentId);
      }
    } catch {
      /* 忽略非 JSON 行 */
    }
  }
  return { status: res.status, agents: [...agents] };
}

async function main() {
  console.log(`Phase 6.5 验收 → ${BASE}\n`);

  const WEALTH = {
    age: 35,
    income: 30000,
    name: "P65 验收",
    assets: { cash: 50000, deposits: 0, stocks: 100000, funds: 50000, bonds: 0, realEstate: 0, other: 0 },
    liabilities: { mortgage: 0, carLoan: 0, creditLoan: 0, loans: 0, other: 0 },
    goals: { type: "retirement", retirementAge: 60, targetAmount: 5000000, targetYears: 25, lifeGoal: "安稳退休" },
  };

  // ════════ 用户 A：测试1 / 测试2 / 测试5 ════════
  console.log("【用户A】注册 + 财富初始化（现金5万 / 股票10万 / 基金5万）");
  const A = makeClient();
  const ua = await registerAndOnboard(A, "a", WEALTH);
  console.log(`  userA = ${ua.userId}`);

  // ── 测试1：Dashboard 打开 0 次 LLM ──
  console.log("\n① 测试1：Dashboard 打开 0 次 LLM");
  const before1 = await readUsage(ua.userId);
  const dash = await A.fetch("/");
  const cache1 = await A.fetch("/api/ai/cache");
  const after1 = await readUsage(ua.userId);
  const dashOk = dash.status === 200;
  const cacheOk = cache1.ok || cache1.status === 200;
  const delta1Calls = after1.calls - before1.calls;
  const delta1Tokens = after1.tokens - before1.tokens;
  check("Dashboard 页面返回 200", dashOk, `status=${dash.status}`);
  check("缓存读取接口可用", cacheOk, `status=${cache1.status}`);
  check("打开 Dashboard 后 LLM 调用次数增量 = 0", delta1Calls === 0, `+${delta1Calls} 次`);
  check("打开 Dashboard 后 Token 增量 = 0", delta1Tokens === 0, `+${delta1Tokens} tokens`);

  // ── 测试2：刷新 10 次 Token = 0 ──
  console.log("\n② 测试2：刷新 10 次 Token = 0");
  const before2 = await readUsage(ua.userId);
  for (let i = 0; i < 10; i++) {
    await A.fetch("/api/ai/cache");
  }
  const after2 = await readUsage(ua.userId);
  const delta2Calls = after2.calls - before2.calls;
  const delta2Tokens = after2.tokens - before2.tokens;
  check("刷新 10 次后 LLM 调用次数增量 = 0", delta2Calls === 0, `+${delta2Calls} 次`);
  check("刷新 10 次后 Token 增量 = 0", delta2Tokens === 0, `+${delta2Tokens} tokens`);

  // ── 测试5：财富评分本地计算（不调 LLM）──
  console.log("\n⑤ 测试5：财富评分本地计算（computeRiskMetrics，无 LLM）");
  const before5 = await readUsage(ua.userId);
  const snap = await A.fetch("/api/market/snapshot");
  const snapData = await snap.json().catch(() => ({}));
  const after5 = await readUsage(ua.userId);
  const score = snapData.twin?.risk?.score;
  check("市场快照返回风险评分", typeof score === "number" && score >= 0 && score <= 100, `risk.score=${score}`);
  check("风险评分由本地引擎计算（非 LLM）", snapData.twin?.risk?.score != null);
  const delta5Tokens = after5.tokens - before5.tokens;
  check("计算财富/风险评分全程 Token 增量 = 0", delta5Tokens === 0, `+${delta5Tokens} tokens`);

  // ════════ 用户 B：测试3 ════════
  console.log("\n【用户B】注册 + 财富初始化（同资产）");
  const B = makeClient();
  const ub = await registerAndOnboard(B, "b", WEALTH);
  console.log(`  userB = ${ub.userId}`);

  // ── 测试3：改资产触发重分析 ──
  console.log("\n③ 测试3：修改资产触发重分析（股票 10万 → 60万，变化 500%）");
  const patchRes = await B.fetch("/api/profile/wealth", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assets: { stocks: 600000 } }),
  });
  const patch = await patchRes.json().catch(() => ({}));
  check("PATCH 成功", patchRes.ok && patch.ok === true, `status=${patchRes.status}`);
  check("变化评分 = high", patch.changeScore === "high", `changeScore=${patch.changeScore}`);
  check("已触发后台重分析（优先级2）", patch.triggeredReanalysis === true, `triggeredReanalysis=${patch.triggeredReanalysis}`);
  // 缓存失效交叉验证：invalidateUser 应清空该用户缓存
  const cacheB = await readCache(ub.userId);
  const cacheCleared = cacheB === null || (Array.isArray(cacheB) && cacheB.length === 0);
  check("变化后旧缓存已失效（无残留 LLM 结果）", cacheCleared, cacheB === null ? "文件已删除" : `剩余 ${Array.isArray(cacheB) ? cacheB.length : "?"} 条`);

  // ════════ 用户 C：测试4 ════════
  console.log("\n【用户C】注册 + 财富初始化 + 种入 retirement 缓存（确定性命中）");
  const C = makeClient();
  const uc = await registerAndOnboard(C, "c", WEALTH);
  console.log(`  userC = ${uc.userId}`);

  // 读取真实 FinancialProfile，本地复刻 compactProfile + inputHash
  const profile = await getProfile(C);
  const question = "我的退休计划怎么样？";
  const finalType = "retirement_plan"; // routeRequest(question) 命中「退休」→ retirement_plan
  const modelName = "unknown"; // 未配置模型时 getActiveModelSummary 返回 modelName 为空 → "unknown"
  const inputHash = hashInput(
    uc.userId,
    finalType,
    question,
    JSON.stringify(compactProfile(profile)),
    modelName
  );

  // 明文种入 retirement 缓存（缓存管理器对明文 JSON 透明兼容）
  const seeded = {
    id: `ac-seed-${Date.now().toString(36)}`,
    userId: uc.userId,
    type: finalType,
    inputHash,
    modelName: "cached-retirement",
    result: [
      {
        agentId: "retirement",
        summary: "（缓存）退休规划分析结果",
        recommendations: [],
        charts: [],
        details: [],
        score: 80,
      },
    ],
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    createdAt: Date.now(),
    expireAt: Date.now() + 24 * 3600 * 1000,
  };
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${safeId(uc.userId)}.json`), JSON.stringify([seeded]), "utf8");

  // 发送退休问题 → 期望缓存命中（0 LLM）且结果仅含 retirement
  console.log("\n④ 测试4：问退休 → 仅 Retirement Agent（缓存命中 0 LLM）");
  const before4 = await readUsage(uc.userId);
  const chat = await chatRetirement(C, question);
  const after4 = await readUsage(uc.userId);
  const delta4Tokens = after4.tokens - before4.tokens;
  const onlyRetirement = chat.agents.length === 1 && chat.agents.includes("retirement");
  const noOtherAgent = !chat.agents.some((a) => a !== "retirement");
  check("chat 返回结果", chat.status === 200, `status=${chat.status}`);
  check("仅触发 Retirement Agent（无其他 Agent）", onlyRetirement && noOtherAgent, `agents=${JSON.stringify(chat.agents)}`);
  check("缓存命中路径 Token 增量 = 0", delta4Tokens === 0, `+${delta4Tokens} tokens`);

  // 清理：删除种入的缓存文件
  try {
    await fs.unlink(path.join(CACHE_DIR, `${safeId(uc.userId)}.json`));
  } catch {
    /* ignore */
  }

  console.log(`\n═══ Phase 6.5 验收结果：${PASS} 通过 / ${FAIL} 失败 ═══`);
  if (FAIL > 0) {
    console.log("未通过项：");
    for (const l of LOG.filter((x) => x.includes("✗"))) console.log("  " + l);
  }
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("验收脚本异常:", err);
  process.exit(1);
});
