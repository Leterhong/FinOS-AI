/**
 * Phase 7.0.2 Backend Business Service Migration — 验收脚本
 *
 * 运行：BASE_URL=http://localhost:8300 node scripts/phase702-acceptance.mjs
 * 覆盖需求十五五项测试 + 监控/RAG/文档解析增强覆盖。
 *
 * 统一返回格式：{ success, data, message } / { success:false, error }
 */
const BASE = (process.env.BASE_URL || "http://localhost:8300").replace(/\/$/, "");

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function api(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form; // FormData（含文件）
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function uid() {
  return Math.random().toString(36).slice(2, 8);
}

async function freshUser(tag) {
  const email = `${tag}-${Date.now()}-${uid()}@finos.test`;
  const password = "Passw0rd!2026";
  const r = await api("POST", "/auth/register", { body: { email, password } });
  if (!r.json?.success) throw new Error(`注册失败: ${JSON.stringify(r.json)}`);
  return { email, password, token: r.json.data.token, user: r.json.data.user };
}

async function main() {
  console.log(`\n=== Phase 7.0.2 验收 @ ${BASE} ===\n`);

  // ---------- 测试 1：持久化 ----------
  console.log("【测试 1】用户创建资产 → 刷新页面 → 数据仍存在");
  const A = await freshUser("a1");
  const assetBody = { type: "cash", name: "招商银行储蓄", amount: 50000 };
  const add = await api("POST", "/assets", { token: A.token, body: assetBody });
  assert(add.json?.success, "添加资产接口成功");
  const list1 = await api("GET", "/assets", { token: A.token });
  assert(list1.json?.data?.total === 50000, "GET /assets 返回刚添加的资产（total=50000）");
  // 模拟刷新：再次拉取
  const list2 = await api("GET", "/assets", { token: A.token });
  assert(list2.json?.data?.assets?.length === list1.json?.data?.assets?.length, "刷新后资产数量一致（持久化）");
  const assetId = list1.json?.data?.assets?.[0]?.id;
  assert(!!assetId, "资产 ID 已生成");

  // Twin 重算反映真实数据
  const rec = await api("POST", "/twin/recalculate", { token: A.token });
  assert(rec.json?.success && rec.json?.data?.netWorth === 50000, "Twin 重算净值=50000（读取真实数据）");

  // ---------- 测试 2：重新登录数据恢复 ----------
  console.log("\n【测试 2】重新登录其他设备 → 财富数据恢复");
  const login = await api("POST", "/auth/login", { body: { email: A.email, password: A.password } });
  assert(login.json?.success && login.json?.data?.token, "重新登录拿到新 token");
  const reloginList = await api("GET", "/assets", { token: login.json.data.token });
  assert(reloginList.json?.data?.total === 50000, "用新 token 拉取资产=50000（数据恢复）");

  // ---------- 测试 3：AI CFO 读取真实用户数据 ----------
  console.log("\n【测试 3】运行 AI CFO → 读取真实用户数据");
  // 先建画像，让 CFO 有目标/风险上下文
  await api("POST", "/financial/profile", { token: A.token, body: { age: 35, income: 20000, expense: 12000, risk_level: "balanced", goal: "积累 100 万退休金" } });
  const cfo = await api("POST", "/cfo/analyze", { token: A.token, body: { question: "我该如何优化资产配置" } });
  assert(cfo.json?.success, "CFO 分析接口成功");
  assert(cfo.json?.data?.hasData === true, "CFO 读取到真实数据（hasData=true）");
  assert(cfo.json?.data?.twin?.netWorth === 50000, "CFO 基于真实 Twin（净值 50000）");
  assert(["local", "ai"].includes(cfo.json?.data?.advice?.tier), "建议分级 local/ai 之一");
  assert(cfo.json?.data?.disclaimer?.includes("不构成投资建议"), "带合规免责声明");

  // ---------- 测试 4：Agent 任务持久化 ----------
  console.log("\n【测试 4】Agent 任务 → 保存任务状态");
  const agentRun = await api("POST", "/agent/tasks", { token: A.token, body: { task_type: "cfo", question: "分析我的风险敞口" } });
  assert(agentRun.json?.success, "Agent 编排接口成功");
  const taskId = agentRun.json?.data?.taskId;
  assert(!!taskId, "任务 ID 已生成");
  assert(agentRun.json?.data?.agents?.length >= 1, "编排路由选择了子智能体");
  const taskList = await api("GET", "/agent/tasks", { token: A.token });
  assert(taskList.json?.data?.tasks?.some((t) => t.id === taskId), "任务已持久化到列表");
  const taskDetail = await api("GET", `/agent/tasks/${taskId}`, { token: A.token });
  assert(taskDetail.json?.data?.status === "completed", "任务状态机到达 completed");
  assert(taskDetail.json?.data?.result?.execution?.steps >= 1, "任务结果含执行步骤");

  // ---------- 测试 5：不同用户无法读取对方 Memory / 资产 ----------
  console.log("\n【测试 5】不同用户 → 无法读取对方 Memory / 资产（隔离）");
  const B = await freshUser("b1");
  const bMem = await api("POST", "/memory", { token: B.token, body: { memory_type: "fact", content: "B 的私密目标" } });
  assert(bMem.json?.success, "用户 B 写入记忆");
  const bMemList = await api("GET", "/memory", { token: B.token });
  assert(bMemList.json?.data?.memories?.length === 1, "用户 B 能看到自己的 1 条记忆");
  const aMemList = await api("GET", "/memory", { token: A.token });
  assert(aMemList.json?.data?.memories?.length === 0, "用户 A 看不到 B 的记忆（隔离）");
  const bAssets = await api("GET", "/assets", { token: B.token });
  assert(bAssets.json?.data?.total === 0, "用户 B 资产为空");
  // B 尝试删除 A 的资产 → 404
  if (assetId) {
    const delByB = await api("DELETE", `/assets/${assetId}`, { token: B.token });
    assert(delByB.status === 404, "用户 B 删除 A 的资产被拒（404 隔离）");
  }
  const bTwin = await api("GET", "/twin/status", { token: B.token });
  assert(bTwin.json?.data?.hasData === false && bTwin.json?.data?.message?.includes("欢迎创建你的财富数字分身"), "新用户无任何 Demo 数据（欢迎态）");

  // ---------- 增强覆盖：监控 / RAG / 文档解析 ----------
  console.log("\n【增强】Monitor / RAG / Document 解析");
  // Monitor 写通知
  const mon = await api("POST", "/monitor/run", { token: A.token });
  assert(mon.json?.success && mon.json?.data?.hasData === true, "Monitor 运行成功");
  const notif = await api("GET", "/notifications", { token: A.token });
  assert(notif.json?.data?.notifications?.some((n) => n.source === "monitor"), "Monitor 写入通知中心（source=monitor）");

  // RAG 入库 + 检索
  const ingest = await api("POST", "/rag/ingest", { token: A.token, body: { title: "退休规划要点", category: "retirement", text: "退休规划应配置指数基金并预留应急金" } });
  assert(ingest.json?.success, "RAG 知识入库成功");
  const ragQ = await api("POST", "/rag/query", { token: A.token, body: { question: "如何做退休规划", topK: 3 } });
  assert(ragQ.json?.success && ragQ.json?.data?.hits?.length >= 1, "RAG 检索命中入库知识（用户隔离）");
  assert(ragQ.json?.data?.sources?.[0]?.scope === "personal", "检索来源归属个人空间");

  // Document 上传 → 解析 → 确认
  const csv = "name,type,amount\n招商银行,现金,30000\n贵州茅台,股票,8000";
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "wealth.csv");
  const up = await api("POST", "/documents/upload", { token: A.token, form });
  assert(up.json?.success, "文档上传成功");
  const docId = up.json?.data?.id;
  const analyze = await api("POST", "/documents/analyze", { token: A.token, body: { documentId: docId } });
  assert(analyze.json?.success && analyze.json?.data?.records?.length === 2, "文档解析提取 2 条候选记录");
  assert(analyze.json?.data?.records?.[0]?.type === "cash", "候选类型推断正确（现金）");
  const before = (await api("GET", "/assets", { token: A.token })).json?.data?.total;
  const confirm = await api("POST", `/documents/${docId}/confirm`, { token: A.token, body: { records: analyze.json?.data?.records } });
  assert(confirm.json?.success && confirm.json?.data?.count === 2, "确认后保存 2 条资产");
  const after = (await api("GET", "/assets", { token: A.token })).json?.data?.total;
  assert(after === before + 38000, `资产总额增加 38000（${before} → ${after}）`);

  // ---------- 汇总 ----------
  console.log(`\n=== 结果：通过 ${passed}，失败 ${failed} ===`);
  if (failed > 0) {
    console.log("失败项：");
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  console.log("全部通过 ✅");
}

main().catch((e) => {
  console.error("验收脚本异常：", e);
  process.exit(1);
});
