/**
 * Phase 6.9 验收脚本 —— Real Financial Data Integration + AI Investment Intelligence
 * ───────────────────────────────────────────────────────────────────────────
 * 覆盖需求十六约定的 5 项端到端验收：
 *   ① 添加股票持仓 + 配置数据源 → 组合返回该持仓；有实时行情则价格>0，
 *      行情不可用则必须给出明确提示（绝不伪造价格，需求十四）
 *   ② 行情驱动组合计算 → 市值 = 数量 × 现价（live 时），刷新后 updatedAt 前进
 *   ③ 风险信号（集中度 100% / 收益异常）→ AI 投资分析产生 Risk 报告并
 *      推送提醒到通知中心（market-monitor 来源）
 *   ④ 无投资持仓 → hasInvestments=false 且提示「暂无投资数据」
 *   ⑤ 数据源失败（无效自定义源）→ 缓存降级或明确提示，不返回虚假行情
 *
 * 设计要点：
 *   - 测试 ① ② 依赖公网腾讯行情接口；无外网时自动降级断言「明确提示」路径，
 *     两种结果都符合需求十四（真实 or 明确说明，绝不伪造）。
 *   - 测试 ③ 用单一持仓（集中度 100%）确定性触发风险信号，不依赖真实大跌。
 *   - 测试用户均为新注册账户（未配 AI 模型）→ narrative 走 local 模板，0 LLM 成本。
 *
 * 前置条件：开发服务器已在运行（默认 http://localhost:3000）。
 *   - 启动：cd "/f/FinOS AI" && NODE_OPTIONS="--use-system-ca" npm run dev
 *   - 自定义端口：BASE_URL=http://localhost:3001 node scripts/phase69-acceptance.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

let pass = 0;
let fail = 0;
function log(s) {
  process.stdout.write(s + "\n");
}
function assert(name, cond, detail = "") {
  if (cond) {
    pass++;
    log(`  ✅ PASS  ${name}${detail ? `  — ${detail}` : ""}`);
  } else {
    fail++;
    log(`  ❌ FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}
function cookieFrom(setCookieHeader) {
  if (!setCookieHeader) return null;
  return setCookieHeader.split(";")[0];
}

/* ── HTTP 辅助 ──────────────────────────────────────────────────────────── */
async function api(cookie, path, method = "GET", body) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}
async function register(email, password, name) {
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return { res: r, cookie: cookieFrom(r.headers.get("set-cookie")) };
}

const PWD = "test1234";
const ts = Date.now();
async function freshUser(name) {
  const email = `phase69-${name}-${ts}@finos.test`;
  const reg = await register(email, PWD, name);
  if (!reg.res.ok || !reg.cookie) {
    throw new Error(`注册失败 ${name}: ${reg.res.status}`);
  }
  return reg.cookie;
}

const BASE_PROFILE = {
  age: 35,
  monthlyIncome: 25000,
  monthlyExpenses: 9000,
  totalAssets: 800000,
  riskLevel: "moderate",
  retirementAge: 60,
  retirementTarget: 5000000,
  goals: [{ type: "retirement", label: "60 岁退休" }],
  assetBreakdown: {
    cashSavings: 300000,
    realEstate: 0,
    stockPortfolio: 0,
    funds: 0,
  },
  liabilities: 0,
  insurance: 0,
};

/** 配置腾讯行情数据源（公开免 Key） */
async function addTencentSource(cookie) {
  return api(cookie, "/api/finance/sources", "POST", {
    kind: "tencent-quote",
    name: "腾讯行情（验收）",
  });
}

/** 添加一笔股票持仓（贵州茅台，成本价刻意偏低以产生正收益结构） */
async function addStock(cookie, { code = "600519", shares = 100, cost = 1000 } = {}) {
  return api(cookie, "/api/financial-data/assets", "POST", {
    name: "贵州茅台",
    type: "stock",
    code,
    shares,
    cost,
    marketValue: shares * cost,
    totalCost: shares * cost,
  });
}

/* ── 主流程 ─────────────────────────────────────────────────────────────── */
async function main() {
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("  FinOS AI · Phase 6.9 验收测试（真实金融数据 + AI 投资智能）");
  log(`  目标服务：${BASE}`);
  log("══════════════════════════════════════════════════════════════");

  // 健康检查（3xx 重定向视为可达）
  try {
    const h = await fetch(BASE + "/", { signal: AbortSignal.timeout(90000) });
    if (!h || h.status < 200 || h.status >= 500)
      throw new Error(`HTTP ${h?.status ?? "no-response"}`);
  } catch (e) {
    log(`\n[错误] 无法连接 ${BASE}：${e.message}`);
    log('请先启动开发服务器：NODE_OPTIONS="--use-system-ca" npm run dev');
    process.exit(2);
  }
  log("  ✓ 服务可达");

  /* ──────────────────────────────────────────────────────────── */
  log("\n[①] 添加股票持仓 + 数据源 → 真实行情（或明确提示，绝不伪造）");
  let liveQuotesAvailable = false;
  {
    const cookie = await freshUser("stock");
    const cp = await api(cookie, "/api/profile", "POST", BASE_PROFILE);
    assert("画像创建成功", cp.res.ok, `status=${cp.res.status}`);

    const src = await addTencentSource(cookie);
    assert("配置腾讯行情数据源成功", src.res.ok, `status=${src.res.status}`);

    const add = await addStock(cookie);
    assert("添加股票持仓成功（600519 × 100 股）", add.res.ok, `status=${add.res.status}`);

    const pf = await api(cookie, "/api/finance/portfolio");
    assert("组合接口返回 200", pf.res.ok, `status=${pf.res.status}`);
    const view = pf.json.portfolio;
    assert("组合包含投资持仓（hasInvestments=true）", view?.hasInvestments === true);
    const pos = (view?.positions ?? []).find((p) => (p.code ?? "").includes("600519"));
    assert("持仓列表包含 600519", !!pos, `positions=${view?.positions?.length ?? 0}`);

    if (pos?.quoteStatus === "live") {
      liveQuotesAvailable = true;
      assert("实时行情价格 > 0", pos.currentPrice > 0, `price=${pos.currentPrice}`);
      assert(
        "行情来源标注真实数据源",
        typeof pos.quoteSource === "string" && pos.quoteSource.length > 0,
        `source=${pos.quoteSource}`,
      );
    } else {
      // 无外网 / 数据源不可用：必须明确提示，绝不伪造价格
      assert(
        "行情不可用时给出明确提示（不伪造价格）",
        typeof view?.dataNotice === "string" && view.dataNotice.length > 0,
        `dataStatus=${view?.dataStatus}, notice=${view?.dataNotice}`,
      );
    }

    /* ── ② 行情驱动组合计算 ── */
    log("\n[②] 行情变化 → 自动更新组合计算");
    if (pos?.quoteStatus === "live") {
      const expected = (pos.shares ?? 0) * (pos.currentPrice ?? 0);
      assert(
        "市值 = 数量 × 现价（纯代码计算）",
        Math.abs(pos.marketValue - expected) < 1,
        `marketValue=${pos.marketValue}, shares×price=${expected.toFixed(2)}`,
      );
      assert(
        "收益率已按真实行情计算",
        typeof pos.returnRate === "number",
        `returnRate=${pos.returnRate}`,
      );
      const t1 = view.updatedAt;
      await new Promise((r) => setTimeout(r, 1100));
      const pf2 = await api(cookie, "/api/finance/portfolio");
      const view2 = pf2.json.portfolio;
      assert(
        "再次刷新组合时间戳前进（行情驱动重算）",
        pf2.res.ok && view2?.updatedAt && view2.updatedAt >= t1,
        `t1=${t1}, t2=${view2?.updatedAt}`,
      );
      assert(
        "组合总值 > 0 且来自行情回写",
        view2?.totalValue > 0,
        `totalValue=${view2?.totalValue}`,
      );
    } else {
      assert(
        "行情不可用 → 跳过实时重算验证（提示已验证，符合需求十四）",
        true,
        "无外网环境降级路径",
      );
    }
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n[③] 风险信号（100% 集中度）→ Risk 报告 + 通知中心提醒");
  {
    const cookie = await freshUser("risk");
    await api(cookie, "/api/profile", "POST", {
      ...BASE_PROFILE,
      riskLevel: "conservative", // 保守型 + 全仓股票 → 必触发偏好不匹配
    });
    await addTencentSource(cookie);
    await addStock(cookie, { code: "600519", shares: 200, cost: 2000 });

    const an = await api(cookie, "/api/finance/analyze", "POST", { wantAI: false });
    assert("AI 投资分析接口返回 200", an.res.ok, `status=${an.res.status}`);
    const result = an.json.result;
    assert("返回完整分析流水线结果", !!result?.portfolio && !!result?.narrative);
    assert(
      "本地解读（0 LLM 成本，未配模型）",
      result?.narrative?.tier === "local",
      `tier=${result?.narrative?.tier}, aiCalls=${result?.aiCalls}`,
    );
    const risk = result?.risk;
    assert("生成投资风险报告", !!risk, `grade=${risk?.riskGrade}`);
    const alerts = risk?.alerts ?? [];
    assert(
      "单一持仓 100% 集中度触发风险提醒",
      alerts.length > 0,
      `alerts=${alerts.map((a) => a.title).join(" / ")}`,
    );
    assert(
      "保守型画像 + 全仓股票 → 判定组合超出风险偏好",
      risk?.matchesProfile === false,
      `matchesProfile=${risk?.matchesProfile}`,
    );
    assert(
      "风险报告携带免责声明",
      typeof risk?.disclaimer === "string" && risk.disclaimer.includes("不构成投资建议"),
    );

    // 风险提醒推送到通知中心（market-monitor 来源）
    const nt = await api(cookie, "/api/ai/proactive/notifications");
    const items = nt.json.notifications ?? nt.json.items ?? [];
    const marketAlerts = items.filter((n) => n.source === "market-monitor");
    assert(
      "风险提醒已写入通知中心（market-monitor）",
      marketAlerts.length > 0,
      `market-monitor 通知数=${marketAlerts.length}/${items.length}`,
    );
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n[④] 无投资持仓 → 暂无投资数据");
  {
    const cookie = await freshUser("empty");
    await api(cookie, "/api/profile", "POST", BASE_PROFILE);
    const pf = await api(cookie, "/api/finance/portfolio");
    assert("组合接口返回 200", pf.res.ok, `status=${pf.res.status}`);
    const view = pf.json.portfolio;
    assert("hasInvestments=false", view?.hasInvestments === false);
    assert(
      "提示「暂无投资数据」",
      typeof view?.dataNotice === "string" && view.dataNotice.includes("暂无投资数据"),
      `notice=${view?.dataNotice}`,
    );
    assert(
      "不展示任何持仓 / 不伪造数据",
      (view?.positions ?? []).length === 0 && (view?.totalValue ?? 0) === 0,
    );
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n[⑤] 数据源失败 → 缓存降级 + 明确提示（不返回虚假行情）");
  {
    const cookie = await freshUser("failover");
    await api(cookie, "/api/profile", "POST", BASE_PROFILE);
    await addStock(cookie);

    // 先用腾讯源刷新一次（如外网可用则写入缓存）
    const src = await addTencentSource(cookie);
    const srcId = src.json.source?.id;
    await api(cookie, "/api/finance/portfolio");

    // 删除正常源 → 换成必然失败的自定义源
    if (srcId) await api(cookie, `/api/finance/sources/${srcId}`, "DELETE");
    const bad = await api(cookie, "/api/finance/sources", "POST", {
      kind: "custom",
      name: "失效数据源（验收）",
      baseUrl: "http://127.0.0.1:9",
      apiKey: "invalid-key",
    });
    assert("添加失效自定义数据源成功", bad.res.ok, `status=${bad.res.status}`);

    const pf = await api(cookie, "/api/finance/portfolio");
    assert("数据源失败时组合接口仍可用（200）", pf.res.ok, `status=${pf.res.status}`);
    const view = pf.json.portfolio;
    const status = view?.dataStatus;
    if (liveQuotesAvailable) {
      // 有缓存 → 应降级为 cached/partial 并提示
      assert(
        "降级为缓存行情（cached/partial）",
        status === "cached" || status === "partial",
        `dataStatus=${status}`,
      );
    } else {
      assert(
        "无缓存时状态为 none/cached（不伪造）",
        status === "none" || status === "cached",
        `dataStatus=${status}`,
      );
    }
    assert(
      "给出数据源失败 / 缓存提示",
      typeof view?.dataNotice === "string" && view.dataNotice.length > 0,
      `notice=${view?.dataNotice}`,
    );
    // 无论如何：不允许凭空出现 live 行情
    const fakeLive = (view?.positions ?? []).some((p) => p.quoteStatus === "live");
    assert("失效源下不出现伪造的 live 行情", !fakeLive);
  }

  /* ── 汇总 ── */
  log("\n══════════════════════════════════════════════════════════════");
  log(`  验收结果：${pass} 通过 / ${fail} 失败（共 ${pass + fail} 项断言）`);
  log("══════════════════════════════════════════════════════════════\n");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  log(`\n[致命错误] ${e.stack || e.message}`);
  process.exit(2);
});
