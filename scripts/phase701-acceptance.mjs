/**
 * FinOS AI · Phase 7.0.1 验收测试（Backend Foundation Migration）
 *
 * 运行：node scripts/phase701-acceptance.mjs
 * 前提：后端已启动（默认 http://localhost:8300）
 *
 * 覆盖需求十五的 5 项测试：
 *  ① 注册用户A → 创建资产 → 重新查询（模拟刷新）数据仍存在
 *  ② 注册用户B → 无法看到用户A数据（用户隔离）
 *  ③ 丢弃 token 重新登录（模拟清缓存）→ 数据恢复
 *  ④ AI 模型配置 → API Key 不暴露给前端（仅掩码）
 *  ⑤ 新用户 → 无任何 Demo 财富数据，显示欢迎创建财富数字分身
 */

const BASE = process.env.BACKEND_URL || "http://localhost:8300";

let passed = 0;
let failed = 0;

function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ PASS  ${name}${detail ? "  — " + detail : ""}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL  ${name}${detail ? "  — " + detail : ""}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function freshEmail(tag) {
  return `p701_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e4)}@test.finos`;
}

async function main() {
  console.log("═".repeat(62));
  console.log("  FinOS AI · Phase 7.0.1 验收测试（后端基础架构迁移）");
  console.log(`  目标服务：${BASE}`);
  console.log("═".repeat(62));

  const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null);
  if (!health?.success) {
    console.error("  ✗ 后端服务不可达，请先启动：python -m uvicorn backend.main:app --port 8300");
    process.exit(1);
  }
  console.log("  ✓ 后端服务可达\n");

  // ═══ 测试① 用户A注册 + 资产持久化 ═══
  console.log("[①] 注册用户A → 创建资产 → 刷新后数据仍存在");
  const emailA = freshEmail("userA");
  const passA = "StrongPass_701A";
  const regA = await api("POST", "/auth/register", { body: { email: emailA, password: passA } });
  check("注册用户A成功（统一返回格式）", regA.status === 200 && regA.json?.success === true && !!regA.json?.data?.token);
  const tokenA = regA.json.data.token;
  check("注册响应不含密码哈希", !JSON.stringify(regA.json).includes("password"));

  const profA = await api("POST", "/financial/profile", {
    token: tokenA,
    body: { age: 28, income: 30000, expense: 15000, risk_level: "balanced", goal: "五年内积累第一个一百万" },
  });
  check("创建财富画像成功", profA.status === 200 && profA.json?.success === true);

  const asset1 = await api("POST", "/financial/assets", {
    token: tokenA,
    body: { type: "cash", name: "招商银行储蓄", amount: 200000 },
  });
  const asset2 = await api("POST", "/financial/assets", {
    token: tokenA,
    body: { type: "stock", name: "贵州茅台", amount: 132100 },
  });
  check("创建2笔资产成功", asset1.json?.success === true && asset2.json?.success === true);

  // 模拟刷新页面：重新 GET
  const listA = await api("GET", "/financial/assets", { token: tokenA });
  check(
    "刷新后资产仍存在（数据库持久化）",
    listA.json?.data?.assets?.length === 2 && listA.json?.data?.total === 332100,
    `count=${listA.json?.data?.assets?.length}, total=${listA.json?.data?.total}`
  );

  const twinA = await api("GET", "/financial/profile", { token: tokenA });
  check(
    "Twin 后端计算正确（净值=332100）",
    twinA.json?.data?.hasData === true && twinA.json?.data?.netWorth === 332100,
    `netWorth=${twinA.json?.data?.netWorth}, healthScore=${twinA.json?.data?.healthScore}`
  );

  const recalc = await api("POST", "/financial/twin/recalculate", { token: tokenA });
  check("Twin recalculate 接口可用", recalc.json?.success === true && recalc.json?.data?.netWorth === 332100);

  // ═══ 测试② 用户B隔离 ═══
  console.log("\n[②] 注册用户B → 无法看到用户A数据");
  const emailB = freshEmail("userB");
  const regB = await api("POST", "/auth/register", { body: { email: emailB, password: "StrongPass_701B" } });
  const tokenB = regB.json?.data?.token;
  check("注册用户B成功", !!tokenB);

  const listB = await api("GET", "/financial/assets", { token: tokenB });
  check("用户B资产列表为空（看不到A的资产）", listB.json?.data?.assets?.length === 0);

  const aAssetId = listA.json.data.assets[0].id;
  const stealDel = await api("DELETE", `/financial/assets/${aAssetId}`, { token: tokenB });
  check("用户B无法删除用户A的资产（404）", stealDel.status === 404, `status=${stealDel.status}`);

  const noToken = await api("GET", "/financial/assets", {});
  check("未登录访问被拒绝（401）", noToken.status === 401 && noToken.json?.success === false);

  // ═══ 测试③ 清缓存重新登录 ═══
  console.log("\n[③] 丢弃token重新登录（模拟清浏览器缓存）→ 数据恢复");
  const relogin = await api("POST", "/auth/login", { body: { email: emailA, password: passA } });
  check("重新登录成功（bcrypt校验）", relogin.json?.success === true && !!relogin.json?.data?.token);
  const tokenA2 = relogin.json.data.token;
  const listA2 = await api("GET", "/financial/assets", { token: tokenA2 });
  check(
    "新token查询数据完整恢复",
    listA2.json?.data?.assets?.length === 2 && listA2.json?.data?.total === 332100
  );
  const badLogin = await api("POST", "/auth/login", { body: { email: emailA, password: "wrong-password" } });
  check("错误密码被拒绝（401）", badLogin.status === 401);

  // ═══ 测试④ API Key 不暴露 ═══
  console.log("\n[④] AI模型配置 → API Key 不暴露给前端");
  const secretKey = "sk-SUPER-SECRET-KEY-701-abcd1234";
  const createModel = await api("POST", "/ai/models", {
    token: tokenA2,
    body: {
      name: "我的DeepSeek",
      base_url: "https://api.deepseek.com/v1",
      model_id: "deepseek-chat",
      api_key: secretKey,
      is_default: true,
    },
  });
  check("保存模型配置成功", createModel.json?.success === true);
  const createRaw = JSON.stringify(createModel.json);
  check("创建响应不含明文Key", !createRaw.includes(secretKey));

  const models = await api("GET", "/ai/models", { token: tokenA2 });
  const raw = JSON.stringify(models.json);
  check("模型列表不含明文Key", !raw.includes(secretKey));
  check("模型列表不含加密密文字段", !raw.includes("api_key_encrypted") && !raw.includes("apiKeyEncrypted"));
  check(
    "前端只见 名称/状态/掩码",
    models.json?.data?.models?.[0]?.name === "我的DeepSeek" &&
      models.json?.data?.models?.[0]?.keyMask === "****1234" &&
      !!models.json?.data?.models?.[0]?.status,
    `keyMask=${models.json?.data?.models?.[0]?.keyMask}`
  );
  const modelsB = await api("GET", "/ai/models", { token: tokenB });
  check("用户B看不到用户A的模型配置", modelsB.json?.data?.models?.length === 0);

  // ═══ 测试⑤ 新用户无Demo数据 ═══
  console.log("\n[⑤] 新用户 → 没有任何Demo财富数据");
  const emailC = freshEmail("newC");
  const regC = await api("POST", "/auth/register", { body: { email: emailC, password: "StrongPass_701C" } });
  const tokenC = regC.json?.data?.token;
  const twinC = await api("GET", "/financial/profile", { token: tokenC });
  check("新用户 hasData=false（无资产/无目标/无报告）", twinC.json?.data?.hasData === false);
  check(
    "显示「欢迎创建你的财富数字分身」",
    (twinC.json?.data?.message || twinC.json?.message || "").includes("欢迎创建你的财富数字分身"),
    `message=${twinC.json?.data?.message || twinC.json?.message}`
  );
  const rawC = JSON.stringify(twinC.json);
  check("不含任何他人/默认财富数字", !rawC.includes("Alex") && !rawC.includes("1280420") && !rawC.includes("332100"));
  const assetsC = await api("GET", "/financial/assets", { token: tokenC });
  check("新用户资产列表为空", assetsC.json?.data?.assets?.length === 0 && assetsC.json?.data?.total === 0);

  // ═══ 汇总 ═══
  console.log("\n" + "═".repeat(62));
  console.log(`  验收结果：${passed} 通过 / ${failed} 失败（共 ${passed + failed} 项断言）`);
  console.log("═".repeat(62));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("验收脚本异常：", e);
  process.exit(1);
});
