/**
 * Phase 6.8 验收脚本 —— Proactive AI CFO 主动财富管家系统
 * ───────────────────────────────────────────────────────────────────────────
 * 覆盖需求方约定的 5 项端到端验收：
 *   ① 收入降 30% → 现金流风险事件（income-drop，critical）
 *   ② 投资过度集中 → investment-concentration 风险提醒（critical）
 *   ③ 无变化 → 本次体检 aiCalls = 0（不调用任何 LLM）
 *   ④ 关闭主动提醒 → 通知停止推送（enabled=false 时通知列表为空，对照开启时非空）
 *   ⑤ 分级建议文本引用退休目标与风险偏好（local 模板必然结合目标/偏好，无模型时确定性）
 *
 * 设计要点：
 *   - 变化检测基准来自「上次运行日志快照」：故收入降测试需 先跑一次基线 → 改收入 → 再跑。
 *   - 投资集中度 / 建议个性化 均为静态或本地规则，单次运行即可验证。
 *   - 测试用户均为新注册账户（默认未连接 AI 模型），保证 local 降级路径确定可验收。
 *
 * 前置条件：开发服务器已在运行（默认 http://localhost:3000）。
 *   - 启动：cd "/f/FinOS AI" && NODE_OPTIONS="--use-system-ca" npm run dev
 *   - 自定义端口：BASE_URL=http://localhost:3010 node scripts/phase68-acceptance.mjs
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

let pass = 0;
let fail = 0;
const lines = [];
function log(s) {
  lines.push(s);
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
async function register(email, password, name) {
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return { res: r, cookie: cookieFrom(r.headers.get("set-cookie")) };
}
async function createProfile(cookie, input) {
  const r = await fetch(BASE + "/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(input),
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}
async function deleteProfile(cookie) {
  const r = await fetch(BASE + "/api/profile", {
    method: "DELETE",
    headers: { cookie },
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}
async function runProactive(cookie) {
  const r = await fetch(BASE + "/api/ai/proactive/run", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ kind: "manual" }),
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}
async function getSettings(cookie) {
  const r = await fetch(BASE + "/api/ai/proactive/settings", { headers: { cookie } });
  return { res: r, json: await r.json().catch(() => ({})) };
}
async function putSettings(cookie, patch) {
  const r = await fetch(BASE + "/api/ai/proactive/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(patch),
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}
async function getNotifications(cookie) {
  const r = await fetch(BASE + "/api/ai/proactive/notifications", {
    headers: { cookie },
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}

const PWD = "test1234";
const ts = Date.now();
async function freshUser(name) {
  const email = `phase68-${name}-${ts}@finos.test`;
  const reg = await register(email, PWD, name);
  if (!reg.res.ok || !reg.cookie) {
    throw new Error(`注册失败 ${name}: ${reg.res.status}`);
  }
  return reg.cookie;
}

/* ── 主流程 ─────────────────────────────────────────────────────────────── */
async function main() {
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("  FinOS AI · Phase 6.8 验收测试（Proactive AI CFO 主动财富管家）");
  log(`  目标服务：${BASE}`);
  log("══════════════════════════════════════════════════════════════");

  // 健康检查（接受 3xx 重定向为可达）
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
  log("\n[①] 收入降 30% → 现金流风险事件（income-drop）");
  {
    const cookie = await freshUser("income");
    // 基线画像（月收入 20000）
    const base = {
      age: 35,
      monthlyIncome: 20000,
      monthlyExpenses: 8000,
      totalAssets: 1000000,
      riskLevel: "moderate",
      retirementAge: 60,
      retirementTarget: 5000000,
      goals: [{ type: "retirement", label: "60 岁退休" }],
      assetBreakdown: {
        cashSavings: 200000,
        realEstate: 500000,
        stockPortfolio: 200000,
        funds: 100000,
      },
      liabilities: 0,
      insurance: 0,
    };
    const c1 = await createProfile(cookie, base);
    assert("基线画像创建成功", c1.res.ok, `status=${c1.res.status}`);
    const r1 = await runProactive(cookie);
    assert("基线体检成功（200）", r1.res.ok, `status=${r1.res.status}`);
    // 删除画像并重建为「月收入降 30%（14000）」，保留 proactive 运行日志快照
    await deleteProfile(cookie);
    const changed = { ...base, monthlyIncome: 14000 };
    const c2 = await createProfile(cookie, changed);
    assert("变更后画像重建成功（收入 14000）", c2.res.ok, `status=${c2.res.status}`);
    const r2 = await runProactive(cookie);
    assert("变更后体检成功（200）", r2.res.ok, `status=${r2.res.status}`);
    const events = r2.json.result?.events ?? [];
    const incomeDrop = events.find((e) => e.type === "income-drop");
    assert(
      "检测到收入下降事件（income-drop）",
      !!incomeDrop,
      `事件数=${events.length}`
    );
    assert(
      "收入降幅 30% 被判为 critical 现金流风险",
      !!incomeDrop && incomeDrop.severity === "critical",
      `severity=${incomeDrop?.severity}, changePct=${incomeDrop?.changePct}`
    );
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n[②] 投资过度集中 → investment-concentration 风险提醒");
  {
    const cookie = await freshUser("concentration");
    const prof = {
      age: 40,
      monthlyIncome: 30000,
      monthlyExpenses: 10000,
      totalAssets: 1000000,
      riskLevel: "aggressive",
      retirementAge: 60,
      retirementTarget: 5000000,
      goals: [{ type: "retirement", label: "60 岁退休" }],
      // 股票独占 80 万 / 投资资产 80 万（占比 100% ≥ 85% → critical）
      assetBreakdown: {
        cashSavings: 100000,
        realEstate: 100000,
        stockPortfolio: 800000,
        funds: 0,
        bonds: 0,
        crypto: 0,
      },
      liabilities: 0,
      insurance: 0,
    };
    const c = await createProfile(cookie, prof);
    assert("画像创建成功（股票集中）", c.res.ok, `status=${c.res.status}`);
    const r = await runProactive(cookie);
    assert("体检成功（200）", r.res.ok, `status=${r.res.status}`);
    const events = r.json.result?.events ?? [];
    const conc = events.find((e) => e.type === "investment-concentration");
    assert(
      "检测到投资过度集中事件（investment-concentration）",
      !!conc,
      `事件数=${events.length}`
    );
    assert(
      "单一类别占比 100% 被判为 critical 风险提醒",
      !!conc && conc.severity === "critical",
      `severity=${conc?.severity}`
    );
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n[③] 无变化 → 本次体检 aiCalls = 0（不调用任何 LLM）");
  {
    const cookie = await freshUser("stable");
    const prof = {
      age: 38,
      monthlyIncome: 30000,
      monthlyExpenses: 10000,
      totalAssets: 1300000,
      riskLevel: "moderate",
      retirementAge: 60,
      retirementTarget: 5000000,
      goals: [{ type: "retirement", label: "60 岁退休" }],
      assetBreakdown: {
        cashSavings: 200000,
        realEstate: 500000,
        stockPortfolio: 300000,
        funds: 200000,
        bonds: 100000,
      },
      liabilities: 0,
      insurance: 0,
    };
    await createProfile(cookie, prof);
    const r1 = await runProactive(cookie);
    const r2 = await runProactive(cookie); // 相同画像 → 无变化
    assert("两次体检均成功（200）", r1.res.ok && r2.res.ok);
    const res2 = r2.json.result;
    assert(
      "无变化场景下 aiCalls = 0（未触发任何 AI 调用，成本控制达标）",
      res2?.aiCalls === 0,
      `aiCalls=${res2?.aiCalls}`
    );
    const changeEvents = (res2?.events ?? []).filter((e) =>
      ["income-drop", "expense-increase", "savings-rate-drop", "asset-drop", "risk-increase"].includes(
        e.type
      )
    );
    assert(
      "无变化场景未产生任何「变化类」事件",
      changeEvents.length === 0,
      `变化类事件=${changeEvents.length}`
    );
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n[④] 关闭主动提醒 → 通知停止推送（对照开启时非空）");
  {
    const cookie = await freshUser("toggle");
    const prof = {
      age: 40,
      monthlyIncome: 30000,
      monthlyExpenses: 10000,
      totalAssets: 1000000,
      riskLevel: "aggressive",
      retirementAge: 60,
      retirementTarget: 5000000,
      goals: [{ type: "retirement", label: "60 岁退休" }],
      assetBreakdown: {
        cashSavings: 100000,
        realEstate: 100000,
        stockPortfolio: 800000,
        funds: 0,
        bonds: 0,
        crypto: 0,
      },
      liabilities: 0,
      insurance: 0,
    };
    await createProfile(cookie, prof);

    // 4a 关闭提醒
    const off = await putSettings(cookie, { enabled: false });
    assert("设置 enabled=false 成功", off.res.ok, `status=${off.res.status}`);
    const rOff = await runProactive(cookie);
    assert("关闭后体检成功（200）", rOff.res.ok);
    const notifOff = rOff.json.result?.notifications ?? [];
    assert(
      "关闭提醒后：本次结果不推送任何通知（通知停止）",
      notifOff.length === 0,
      `推送数=${notifOff.length}`
    );
    const listOff = await getNotifications(cookie);
    const storedOff = listOff.json?.notifications ?? [];
    assert(
      "关闭提醒后：通知中心列表为空（未持久化任何提醒）",
      storedOff.length === 0,
      `列表数=${storedOff.length}`
    );

    // 4b 对照：开启提醒
    const on = await putSettings(cookie, { enabled: true });
    assert("设置 enabled=true 成功", on.res.ok);
    const rOn = await runProactive(cookie);
    assert("开启后体检成功（200）", rOn.res.ok);
    const notifOn = rOn.json.result?.notifications ?? [];
    assert(
      "开启提醒后：异常事件正常推送通知（对照有效）",
      notifOn.length > 0,
      `推送数=${notifOn.length}`
    );
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n[⑤] 分级建议文本引用退休目标与风险偏好（个性化，禁止泛化）");
  {
    const cookie = await freshUser("advice");
    const prof = {
      age: 42,
      monthlyIncome: 30000,
      monthlyExpenses: 10000,
      totalAssets: 1000000,
      riskLevel: "moderate", // → 稳健型
      retirementAge: 60, // → 建议必须引用「60 岁退休目标」
      retirementTarget: 5000000,
      goals: [{ type: "retirement", label: "60 岁退休" }],
      assetBreakdown: {
        cashSavings: 100000,
        realEstate: 100000,
        stockPortfolio: 800000,
        funds: 0,
        bonds: 0,
        crypto: 0,
      },
      liabilities: 0,
      insurance: 0,
    };
    await createProfile(cookie, prof);
    const r = await runProactive(cookie);
    assert("体检成功（200）", r.res.ok, `status=${r.res.status}`);
    const advice = r.json.result?.advice;
    assert("生成了主动建议（advice 非空）", !!advice);
    // 新用户未连接模型 → 必然走本地规则（usedLLM=false，确定可验收）
    assert(
      "无模型环境下走本地规则（usedLLM=false，零成本）",
      advice?.usedLLM === false,
      `usedLLM=${advice?.usedLLM}`
    );
    const text = advice?.text ?? "";
    assert(
      "建议文本引用退休目标（含「退休目标」）",
      text.includes("退休目标"),
      `片段=${text.slice(0, 60)}…`
    );
    assert(
      "建议文本引用风险偏好（含「风险偏好」）",
      text.includes("风险偏好"),
      `片段=${text.slice(0, 60)}…`
    );
    assert(
      "建议文本引用具体风险标签（稳健型）",
      text.includes("稳健型"),
      `风险标签命中`
    );
  }

  /* ──────────────────────────────────────────────────────────── */
  log("\n────────────────────────────────────────────────────────────");
  log(`  验收结果：${pass} 通过 / ${fail} 失败`);
  log("────────────────────────────────────────────────────────────");
  log(
    fail === 0
      ? "  🎉 Phase 6.8 验收全部通过：主动监控（收入降/投资集中检测）、成本控制（无变化 0 调用）、避免骚扰（关闭即停）、个性化建议（引用目标与偏好）均工作正常。"
      : "  ⚠️  存在失败项，请查看上方 FAIL 明细并修复。"
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n[致命错误] ${e?.stack || e?.message || e}`);
  process.exit(3);
});
