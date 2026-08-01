/**
 * Phase 6.3 #219 金融数据中心页 冒烟测试。
 * 验证新增的两大能力：手动资产（增删）+ 数据授权管理（读取 / 开关 / 审计）。
 * 运行：node scripts/phase63-data-center.mjs [baseUrl]
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
      if (jar.size > 0) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
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
  const email = `dc-${tag}-${Date.now()}@test.finos`;
  const password = "Passw0rd!123";
  let res = await client.fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: `DC ${tag}` }),
  });
  const reg = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`注册失败: ${res.status} ${JSON.stringify(reg)}`);
  const userId = reg.user?.id;
  res = await client.fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId, name: `DC ${tag}`, age: 30, monthlyIncome: 20000, monthlyExpenses: 12000,
      totalAssets: 100000, liabilities: 0, riskLevel: "moderate",
      assetBreakdown: { cashSavings: 100000, stockPortfolio: 0 },
      goals: [{ type: "retirement", label: "60 岁退休", targetYear: 2056, targetAmount: 5000000, priority: "high" }],
      retirementAge: 60, retirementTarget: 5000000,
    }),
  });
  const prof = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`创建画像失败: ${res.status} ${JSON.stringify(prof)}`);
  return { email, userId };
}

async function main() {
  console.log(`#219 金融数据中心冒烟 → ${BASE}\n`);

  const client = makeClient();
  const user = await registerAndOnboard(client, "u");
  console.log(`  user = ${user.userId}\n`);

  // ── 手动资产：新增 ──
  console.log("【手动资产】添加现金 / 股票");
  let res = await client.fetch("/api/financial-data/assets", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "招行活期", type: "cash", marketValue: 50000 }),
  });
  let data = await res.json();
  check("POST 现金资产成功", res.ok && data.ok === true, data.error);
  const cashId = data.holding?.id;

  res = await client.fetch("/api/financial-data/assets", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "贵州茅台", type: "stock", code: "600519", shares: 10, marketValue: 17000, totalCost: 15000 }),
  });
  data = await res.json();
  check("POST 股票资产成功", res.ok && data.ok === true, data.error);
  const stockId = data.holding?.id;

  res = await client.fetch("/api/financial-data/assets");
  data = await res.json();
  check("持仓列表含 2 条 manual 资产", res.ok && data.holdings?.length === 2 && data.holdings.every((h) => h.source === "manual"),
    `count=${data.holdings?.length}`);

  // ── 手动资产：删除 ──
  console.log("\n【手动资产】删除一条");
  res = await client.fetch(`/api/financial-data/assets?id=${encodeURIComponent(stockId)}`, { method: "DELETE" });
  data = await res.json();
  check("DELETE 股票资产成功", res.ok && data.ok === true, data.error);
  res = await client.fetch("/api/financial-data/assets");
  data = await res.json();
  check("删除后剩 1 条持仓", data.holdings?.length === 1 && data.holdings[0].id === cashId,
    `count=${data.holdings?.length}`);

  // 恢复：把股票加回（供后续审计测试无副作用）
  await client.fetch("/api/financial-data/assets", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "贵州茅台", type: "stock", code: "600519", shares: 10, marketValue: 17000, totalCost: 15000 }),
  });

  // ── 数据授权管理：读取 ──
  console.log("\n【数据授权】读取默认授权");
  res = await client.fetch("/api/financial-data/consent");
  data = await res.json();
  check("GET consent 默认全授权", res.ok && data.ok && data.scopes?.cashflow === true && data.scopes?.investments === true && data.scopes?.assets === true && data.scopes?.insurance === true);
  check("返回作用域中文标签", Boolean(data.labels?.cashflow) && Boolean(data.labels?.investments), JSON.stringify(data.labels));
  const auditBefore = data.auditLog?.length ?? 0;

  // ── 数据授权：关闭后 AI 读取被审计为「拒绝」；开启后审计为「已授权」──
  console.log("\n【数据授权】关闭 cashflow 后 AI 读取被审计");
  res = await client.fetch("/api/financial-data/consent", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cashflow: false }),
  });
  data = await res.json();
  check("PATCH 关闭 cashflow 成功", res.ok && data.ok && data.scopes?.cashflow === false, data.error);

  // 触发一次洞察（规则模式，无需模型）：应被拦截并落审计
  res = await client.fetch("/api/financial-data/insight", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useLlm: false }),
  });
  data = await res.json();
  check("关闭授权后洞察被拦截", res.ok && Array.isArray(data.insights) && data.insights.length === 0 && /授权/.test(data.message ?? ""), data.message);

  res = await client.fetch("/api/financial-data/consent");
  data = await res.json();
  check("拒绝读取已写入审计日志", (data.auditLog?.length ?? 0) >= 1, `count=${data.auditLog?.length}`);

  // 重新开启后 AI 读取被审计为「已授权」
  res = await client.fetch("/api/financial-data/consent", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cashflow: true }),
  });
  data = await res.json();
  check("PATCH 重新开启 cashflow 成功", res.ok && data.ok && data.scopes?.cashflow === true, data.error);

  await client.fetch("/api/financial-data/insight", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useLlm: false }),
  });
  res = await client.fetch("/api/financial-data/consent");
  data = await res.json();
  check("重新授权后读取再次写入审计", (data.auditLog?.length ?? 0) >= 2, `count=${data.auditLog?.length}`);

  // ── 页面渲染 ──
  console.log("\n【页面渲染】GET /data");
  res = await client.fetch("/data");
  check("已登录访问 /data 返回 200", res.status === 200, `status=${res.status}`);
  const html = await res.text().catch(() => "");
  check("/data 页面含「金融数据中心」标题", html.includes("金融数据中心"));
  check("/data 页面含「我的资产」面板", html.includes("我的资产"));
  check("/data 页面含「数据授权管理」面板", html.includes("数据授权管理"));

  console.log(`\n═══ #219 结果：${PASS} 通过 / ${FAIL} 失败 ═══`);
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("冒烟测试异常：", err);
  process.exit(1);
});
