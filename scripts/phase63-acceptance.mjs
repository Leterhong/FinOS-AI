/**
 * Phase 6.3 验收冒烟测试（#218）。
 * 通过真实 HTTP 调用 dev server 验证九条验收标准中的 ①-⑧（⑨为架构评审项）。
 * 运行：node scripts/phase63-acceptance.mjs [baseUrl]
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

/** 简易 cookie jar client（Node 18+ fetch 不自动带 cookie）。 */
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
  const email = `p63-${tag}-${Date.now()}@test.finos`;
  const password = "Passw0rd!123";
  let res = await client.fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: `P63 ${tag}` }),
  });
  const reg = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`注册失败: ${res.status} ${JSON.stringify(reg)}`);
  const userId = reg.user?.id;

  // 创建画像（onboarding）
  res = await client.fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      name: `P63 ${tag}`,
      age: 30,
      monthlyIncome: 20000,
      monthlyExpenses: 12000,
      totalAssets: 100000,
      liabilities: 0,
      riskLevel: "moderate",
      assetBreakdown: { cashSavings: 100000, stockPortfolio: 0 },
      goals: [
        { type: "retirement", label: "60 岁退休", targetYear: 2056, targetAmount: 5000000, priority: "high" },
      ],
      retirementAge: 60,
      retirementTarget: 5000000,
    }),
  });
  const prof = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`创建画像失败: ${res.status} ${JSON.stringify(prof)}`);
  return { email, userId };
}

async function main() {
  console.log(`Phase 6.3 验收冒烟 → ${BASE}\n`);

  // ── 用户 A ──
  console.log("【准备】注册用户 A + 创建画像");
  const A = makeClient();
  const userA = await registerAndOnboard(A, "a");
  console.log(`  userA = ${userA.userId}`);

  // ① 新用户注册后无任何 Demo 资产
  console.log("\n① 新用户无 Demo 资产");
  let res = await A.fetch("/api/financial-data/assets");
  let data = await res.json();
  check("GET assets 返回空持仓", res.ok && Array.isArray(data.holdings) && data.holdings.length === 0,
    `holdings=${data.holdings?.length}`);
  res = await A.fetch("/api/financial-data/summary");
  data = await res.json();
  check("summary.hasData=false（无 Demo 流水）", res.ok && data.summary?.hasData === false);
  res = await A.fetch(`/api/profile/${userA.userId}`);
  data = await res.json();
  check("画像非 Alex Chen", data.profile?.name !== "Alex Chen", `name=${data.profile?.name}`);

  // ② 添加现金资产
  console.log("\n② 手动添加现金资产");
  res = await A.fetch("/api/financial-data/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "招行活期", type: "cash", marketValue: 50000 }),
  });
  data = await res.json();
  check("POST 现金资产成功", res.ok && data.ok === true, data.error);
  const cashTwinAssets = data.twin?.overview?.totalAssets ?? data.twin?.totalAssets;

  // ③ 添加股票资产
  console.log("\n③ 手动添加股票资产");
  res = await A.fetch("/api/financial-data/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "贵州茅台", type: "stock", code: "600519", shares: 10, marketValue: 17000, totalCost: 15000 }),
  });
  data = await res.json();
  check("POST 股票资产成功", res.ok && data.ok === true, data.error);
  res = await A.fetch("/api/financial-data/assets");
  data = await res.json();
  check("持仓列表含 2 条手动资产", data.holdings?.length === 2 && data.holdings.every((h) => h.source === "manual"));

  // ④ 上传 CSV 流水
  console.log("\n④ 上传 CSV 银行流水");
  const csv = [
    "日期,描述,金额",
    "2026-05-05,工资,20000",
    "2026-05-10,房租,-5000",
    "2026-05-15,超市购物,-800",
    "2026-06-05,工资,20000",
    "2026-06-12,餐饮,-600",
    "2026-06-20,基金申购,-3000",
  ].join("\n");
  res = await A.fetch("/api/financial-data/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "bank-csv",
      fileName: "bank.csv",
      content: Buffer.from(csv, "utf-8").toString("base64"),
      encoding: "base64",
    }),
  });
  data = await res.json();
  check("CSV 导入成功", res.ok && data.ok === true, data.error);
  res = await A.fetch("/api/financial-data/summary");
  data = await res.json();
  check("summary.hasData=true 且有月度现金流", data.summary?.hasData === true && data.summary?.monthlyCashFlow?.length >= 2,
    `months=${data.summary?.monthlyCashFlow?.length}, tx=${data.summary?.transactionCount}`);

  // ⑤ Financial Twin 自动更新
  console.log("\n⑤ Financial Twin 自动更新");
  res = await A.fetch(`/api/profile/${userA.userId}`);
  data = await res.json();
  const p = data.profile ?? {};
  check("画像 cashSavings 已被手动现金重建覆盖", typeof p.cashSavings === "number" && p.cashSavings >= 50000,
    `cashSavings=${p.cashSavings}`);
  check("画像 stockPortfolio 含手动股票", typeof p.stockPortfolio === "number" && p.stockPortfolio >= 17000,
    `stockPortfolio=${p.stockPortfolio}`);
  check("Twin 快照存在", Boolean(data.twin), `twinAssets(现金添加时)=${cashTwinAssets ?? "n/a"}`);

  // ⑥ Dashboard 数据源（API 侧验证 summary + holdings 可得）
  console.log("\n⑥ Dashboard 真实数据（API 侧）");
  res = await A.fetch("/api/financial-data/summary?transactions=1");
  data = await res.json();
  check("summary 接口返回真实持仓+流水", data.summary?.hasData === true && (data.holdings?.length ?? 0) >= 2);

  // ⑦ 数据授权层（AI 基于真实数据 + 可关闭授权）
  console.log("\n⑦ 数据权限层");
  res = await A.fetch("/api/financial-data/consent");
  data = await res.json();
  check("默认全作用域授权", res.ok && data.scopes?.cashflow === true && data.scopes?.investments === true);
  res = await A.fetch("/api/financial-data/consent", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cashflow: false }),
  });
  data = await res.json();
  check("可关闭 cashflow 授权", res.ok && data.scopes?.cashflow === false);
  res = await A.fetch("/api/financial-data/insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ useLlm: false }),
  });
  data = await res.json();
  check("关闭授权后洞察被拦截", res.ok && Array.isArray(data.insights) && data.insights.length === 0 && /授权/.test(data.message ?? ""),
    data.message);
  await A.fetch("/api/financial-data/consent", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cashflow: true }),
  });

  // ⑧ 用户隔离
  console.log("\n⑧ 用户数据完全隔离");
  const B = makeClient();
  const userB = await registerAndOnboard(B, "b");
  console.log(`  userB = ${userB.userId}`);
  res = await B.fetch("/api/financial-data/assets");
  data = await res.json();
  check("用户 B 看不到用户 A 的资产", res.ok && data.holdings?.length === 0, `holdings=${data.holdings?.length}`);
  res = await B.fetch("/api/financial-data/summary");
  data = await res.json();
  check("用户 B 无 A 的流水", data.summary?.hasData === false);
  // 未登录访问
  const guest = makeClient();
  res = await guest.fetch("/api/financial-data/assets");
  check("未登录请求被拒绝", res.status === 401 || res.status === 403 || res.status === 307, `status=${res.status}`);

  console.log(`\n═══ 结果：${PASS} 通过 / ${FAIL} 失败 ═══`);
  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("冒烟测试异常：", err);
  process.exit(1);
});
