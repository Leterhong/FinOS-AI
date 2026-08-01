/**
 * Phase 6.4 验收冒烟测试（真实市场数据与投资分析引擎）。
 * 通过真实 HTTP 调用 dev server 验证七条验收标准：
 * ① 用户资产可关联市场数据 ② 投资组合自动分析 ③ Risk 数据驱动
 * ④ Investment 分析基础数据就绪 ⑤ Investment Twin 更新
 * ⑥ Dashboard 投资中心可访问 ⑦ 无市场数据时优雅降级
 * 测试用户资产：现金 ¥50,000 / 股票 ¥100,000 / 基金 ¥50,000。
 * 运行：node scripts/phase64-acceptance.mjs [baseUrl]
 * 注：Agent LLM 输出质量（③④ 的模型侧）依赖已配置的模型 Key，属人工验收项。
 */

const BASE = process.argv[2] || "http://localhost:3000";
let PASS = 0;
let FAIL = 0;

function check(name, ok, detail = "") {
  if (ok) {
    PASS++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    FAIL++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeClient() {
  const jar = new Map();
  return {
    async fetch(path, opts = {}) {
      const headers = { ...(opts.headers || {}) };
      if (jar.size > 0) {
        headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      }
      const res = await fetch(`${BASE}${path}`, { ...opts, headers, redirect: "manual" });
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

async function registerAndOnboard(client, tag) {
  const email = `p64-${tag}-${Date.now()}@test.finos`;
  const password = "Passw0rd!123";
  let res = await client.fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: `P64 ${tag}` }),
  });
  const reg = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`注册失败: ${res.status} ${JSON.stringify(reg)}`);
  const userId = reg.user?.id;

  res = await client.fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      name: `P64 ${tag}`,
      age: 32,
      monthlyIncome: 25000,
      monthlyExpenses: 14000,
      totalAssets: 200000,
      liabilities: 0,
      riskLevel: "moderate",
      assetBreakdown: { cashSavings: 50000, stockPortfolio: 100000, funds: 50000 },
      goals: [
        { type: "retirement", label: "60 岁退休", targetYear: 2054, targetAmount: 5000000, priority: "high" },
      ],
      retirementAge: 60,
      retirementTarget: 5000000,
    }),
  });
  const prof = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`创建画像失败: ${res.status} ${JSON.stringify(prof)}`);
  return { email, userId };
}

async function addAsset(client, body) {
  const res = await client.fetch("/api/financial-data/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok === true, data };
}

async function main() {
  console.log(`Phase 6.4 验收冒烟 → ${BASE}\n`);

  // ── 准备：测试用户 现金5万 / 股票10万 / 基金5万 ──
  console.log("【准备】注册测试用户 + 添加持仓（现金¥50,000 / 股票¥100,000 / 基金¥50,000）");
  const A = makeClient();
  const userA = await registerAndOnboard(A, "a");
  console.log(`  userA = ${userA.userId}`);

  let r = await addAsset(A, { name: "招行活期", type: "cash", marketValue: 50000 });
  check("添加现金 ¥50,000", r.ok, r.data.error);
  r = await addAsset(A, {
    name: "贵州茅台", type: "stock", code: "600519",
    shares: 60, marketValue: 100000, totalCost: 90000,
  });
  check("添加股票 ¥100,000", r.ok, r.data.error);
  r = await addAsset(A, {
    name: "易方达蓝筹精选", type: "fund", code: "005827",
    shares: 20000, marketValue: 50000, totalCost: 48000,
  });
  check("添加基金 ¥50,000", r.ok, r.data.error);

  // 行情同步前：总值应精确等于 ¥200,000
  let res0 = await A.fetch("/api/market/snapshot");
  let data0 = await res0.json();
  check("同步前组合总值 = ¥200,000", data0.twin?.totalValue === 200000,
    `totalValue=${data0.twin?.totalValue}`);

  // ① 用户资产可关联市场数据
  console.log("\n① 用户资产可关联市场数据");
  let res = await A.fetch("/api/financial-data/quotes?type=stock&code=600519");
  let data = await res.json();
  check("股票行情可查询", res.ok && data.ok === true && typeof data.quote?.price === "number",
    `price=${data.quote?.price} simulated=${data.quote?.simulated}`);
  check("模拟行情明确标注 simulated", data.quote?.simulated === true);
  res = await A.fetch("/api/financial-data/quotes", { method: "POST" });
  data = await res.json();
  check("持仓市值可按行情同步", res.ok && data.ok === true && data.updatedCount >= 2,
    `updated=${data.updatedCount}`);

  // ② 投资组合自动分析
  console.log("\n② 投资组合自动分析（Portfolio Analyzer）");
  res = await A.fetch("/api/market/snapshot");
  data = await res.json();
  const twin = data.twin;
  check("投资孪生接口 200", res.ok && data.ok === true && Boolean(twin));
  check("组合分析 hasData=true", twin?.analysis?.hasData === true,
    `totalValue=${twin?.analysis?.totalValue}`);
  const byClass = twin?.analysis?.byClass ?? [];
  const classMap = Object.fromEntries(byClass.map((s) => [s.type, s.ratio]));
  check("资产类别占比含 现金/股票/基金",
    "cash" in classMap && "stock" in classMap && "fund" in classMap,
    byClass.map((s) => `${s.label}=${(s.ratio * 100).toFixed(1)}%`).join(" "));
  const ratioSum = byClass.reduce((s, x) => s + x.ratio, 0);
  check("占比合计≈100%", Math.abs(ratioSum - 1) < 0.01, `sum=${(ratioSum * 100).toFixed(2)}%`);
  check("行业/集中度分析存在",
    Array.isArray(twin?.analysis?.bySector) && typeof twin?.analysis?.concentration?.top1Ratio === "number",
    `top1=${((twin?.analysis?.concentration?.top1Ratio ?? 0) * 100).toFixed(1)}%`);

  // ③ 风险评估数据驱动（确定性风险引擎，Risk Agent 输入源）
  console.log("\n③ 风险评估数据驱动");
  check("风险评分 0-100", typeof twin?.risk?.score === "number" && twin.risk.score >= 0 && twin.risk.score <= 100,
    `score=${twin?.risk?.score} level=${twin?.risk?.level}`);
  check("风险信号引用真实数字", Array.isArray(twin?.risk?.signals) &&
    twin.risk.signals.every((s) => typeof s.detail === "string" && /\d/.test(s.detail)),
    `signals=${twin?.risk?.signals?.length}`);
  res = await A.fetch("/api/financial-data/consent");
  data = await res.json();
  check("market 数据作用域已注册且默认授权", data.scopes?.market === true,
    `scopes=${JSON.stringify(data.scopes)}`);

  // ④ Investment Agent 分析基础数据就绪（marketData 注入源）
  console.log("\n④ Investment 分析基础数据就绪");
  check("收益指标齐备（收益/波动/回撤/风险收益比字段）",
    twin?.performance && "annualizedReturn" in twin.performance &&
    "volatility" in twin.performance && "maxDrawdown" in twin.performance &&
    "riskReturnRatio" in twin.performance,
    `vol=${twin?.performance?.volatility} mdd=${twin?.performance?.maxDrawdown}`);
  check("市场快照含指数与情绪", Array.isArray(twin?.market?.indices) && twin.market.indices.length > 0 &&
    typeof twin?.market?.sentiment === "string",
    `indices=${twin?.market?.indices?.length} sentiment=${twin?.market?.sentiment}`);
  check("模拟行情强制标注（summary 带模拟说明）",
    twin?.market?.simulated !== true || String(twin?.market?.summary ?? "").includes("模拟"),
    twin?.market?.summary);

  // ⑤ Investment Twin 更新（30 天视图）
  console.log("\n⑤ Investment Twin（30 天视图）");
  check("30 天净值序列", Array.isArray(twin?.series) && twin.series.length >= 20,
    `points=${twin?.series?.length}`);
  check("市场影响说明引用真实数字", typeof twin?.marketImpact === "string" && /\d/.test(twin.marketImpact),
    twin?.marketImpact);
  // 同步后市值由 mock 行情价重算（份额 × 最新价），只校验为正数且现金不变（¥50,000 保留）
  const cashSlice = (twin?.analysis?.byClass ?? []).find((s) => s.type === "cash");
  check("同步后总值有效且现金 ¥50,000 不受行情影响",
    typeof twin?.totalValue === "number" && twin.totalValue > 0 && cashSlice?.value === 50000,
    `totalValue=${twin?.totalValue} cash=${cashSlice?.value}`);

  // ⑥ Dashboard 投资中心可访问
  console.log("\n⑥ Dashboard 投资中心");
  res = await A.fetch("/investments");
  check("已登录访问 /investments 返回 200", res.status === 200, `status=${res.status}`);
  const B = makeClient();
  res = await B.fetch("/investments");
  check("未登录访问 /investments 被重定向（307/302）", res.status === 307 || res.status === 302,
    `status=${res.status}`);

  // ⑦ 无市场数据 / 无持仓时优雅降级
  console.log("\n⑦ 优雅降级");
  const C = makeClient();
  await registerAndOnboard(C, "c");
  res = await C.fetch("/api/market/snapshot");
  data = await res.json();
  check("无持仓用户接口不报错", res.ok && data.ok === true, `status=${res.status}`);
  check("无持仓 twin.hasData=false（不显示虚假数据）", data.twin?.hasData === false);
  check("市场状态字段合法（connected/cached/unavailable）",
    ["connected", "cached", "unavailable"].includes(data.twin?.market?.status),
    `status=${data.twin?.market?.status}`);
  res = await C.fetch("/api/market/snapshot?marketOnly=1");
  data = await res.json();
  check("marketOnly 快照可用", res.ok && data.ok === true && Boolean(data.market));

  console.log(`\n═══ 结果：${PASS} 通过 / ${FAIL} 失败 ═══`);
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("验收脚本异常:", err);
  process.exit(1);
});
