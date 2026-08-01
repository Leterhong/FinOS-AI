/**
 * Phase 6.6 验收脚本 —— RAG 财富知识系统 + Personal Long-term Memory System
 * ───────────────────────────────────────────────────────────────────────────
 * 覆盖需求十七的 5 项端到端验收：
 *   ① 上传退休规划文档进入知识库（MD 入库 + PDF 路径优雅处理）
 *   ② 询问退休规划，RAG 检索命中相关知识
 *   ③ 说「我希望40岁退休」写入长期记忆
 *   ④ 重新登录（新会话）后记忆仍持久存在（"一月后 AI 仍记得"）
 *   ⑤ 删除该记忆后 AI 无法再读取
 *
 * 前置条件：开发服务器已在运行（默认 http://localhost:3000）。
 *   - 启动：cd "/f/FinOS AI" && NODE_OPTIONS="--use-system-ca" npm run dev
 *   - 自定义：BASE_URL=http://localhost:3001 node scripts/phase66-acceptance.mjs
 *
 * 说明：本脚本会注册一个一次性测试账户，跑完清理其长期记忆。
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

/** 从 set-cookie 头提取 `finos_session=...`（不含属性）。 */
function cookieFrom(setCookieHeader) {
  if (!setCookieHeader) return null;
  return setCookieHeader.split(";")[0];
}

/** 最小可用 PDF（内容无关紧要：依赖缺失时路由会在解析前给出明确错误）。 */
const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 40 >> stream
BT /F1 12 Tf 72 720 Td (Retirement Planning) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`
);

const RETIRE_MD = `# 退休规划指南（验收测试文档）

## 退休目标设定
退休规划的第一步是明确目标退休年龄与期望生活方式。若希望在 40 岁提前退休，需要更高的储蓄率与更长的投资期限。

## 资产配置建议
中等风险偏好下，可采用「核心—卫星」策略：以宽基指数基金作为核心仓位（60%），卫星仓位配置债券与黄金（40%）以降低波动。
临近退休前 5 年应逐步降低权益比例，增加固定收益资产，锁定已积累的财富。

## 养老金与现金流
除国家基本养老金外，可补充商业养老年金与个人养老金账户，构建多层现金流，覆盖退休后的生活开支。
定期复盘储蓄率是否达标，是退休规划能否落地的关键。
`;

async function main() {
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("  FinOS AI · Phase 6.6 验收测试（RAG + 长期记忆）");
  log(`  目标服务：${BASE}`);
  log("══════════════════════════════════════════════════════════════");

  // ── 健康检查（首次请求会触发按需编译，放宽超时）──
  try {
    const h = await fetch(BASE + "/", { signal: AbortSignal.timeout(60000) });
    if (!h.ok) throw new Error(`HTTP ${h.status}`);
  } catch (e) {
    log(`\n[错误] 无法连接 ${BASE}：${e.message}`);
    log("请先启动开发服务器：npm run dev");
    process.exit(2);
  }
  log("  ✓ 服务可达");

  // ── 注册一次性测试账户（自动写入会话）──
  const email = `phase66-${Date.now()}@finos.test`;
  const password = "test1234";
  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "验收测试用户" }),
  });
  const cookie = cookieFrom(reg.headers.get("set-cookie"));
  const regJson = await reg.json().catch(() => ({}));
  assert("注册测试账户并写入会话", reg.ok && !!cookie, `email=${email}`);

  const headers = () => ({ cookie, "Content-Type": "application/json" });

  // ── ① 上传退休规划文档进入知识库 ──
  log("\n[①] 上传退休规划文档进入知识库");
  const fd = new FormData();
  fd.append(
    "file",
    new Blob([RETIRE_MD], { type: "text/markdown" }),
    "retirement-planning.md"
  );
  const up = await fetch(BASE + "/api/knowledge/upload", {
    method: "POST",
    headers: { cookie },
    body: fd,
  });
  const upJson = await up.json().catch(() => ({}));
  assert(
    "退休规划 MD 文档入库（同步解析 + 切片 + 向量化）",
    up.ok && upJson.ok && upJson.document?.chunkCount > 0,
    `chunks=${upJson.document?.chunkCount}, status=${upJson.document?.status}`
  );

  // PDF 路径：依赖未安装时应优雅返回可行动错误（而非 500 崩溃）
  const fd2 = new FormData();
  fd2.append(
    "file",
    new Blob([MINIMAL_PDF], { type: "application/pdf" }),
    "retirement.pdf"
  );
  const upPdf = await fetch(BASE + "/api/knowledge/upload", {
    method: "POST",
    headers: { cookie },
    body: fd2,
  });
  const upPdfJson = await upPdf.json().catch(() => ({}));
  const pdfHandled =
    (upPdf.ok && upPdfJson.ok) || typeof upPdfJson.error === "string";
  const pdfIngested = upPdf.ok && upPdfJson.ok;
  assert(
    "PDF 上传路径被正确处理（入库或给出明确依赖指引）",
    pdfHandled,
    pdfIngested
      ? "PDF 已入库（已安装 pdf-parse）"
      : `网关指引：${String(upPdfJson.error || "").slice(0, 60)}`
  );

  // ── ② RAG 检索命中退休知识 ──
  log("\n[②] 询问退休规划 → RAG 检索");
  const sr = await fetch(BASE + "/api/knowledge/search", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query: "如何规划 40 岁提前退休 资产配置" }),
  });
  const srJson = await sr.json().catch(() => ({}));
  const chunks = srJson.chunks || [];
  const retireHit = chunks.some(
    (c) => /退休/.test(c.text) || /退休/.test(c.title)
  );
  assert(
    "RAG 检索返回相关片段",
    sr.ok && chunks.length > 0,
    `命中 ${chunks.length} 条`
  );
  assert(
    "检索结果包含退休规划内容",
    retireHit,
    retireHit ? `示例：「${chunks.find((c) => /退休/.test(c.title) || /退休/.test(c.text))?.title}」` : "未命中退休关键词"
  );

  // ── ③ 写长期记忆：我希望40岁退休 ──
  log("\n[③] 写入长期记忆（对话自动抽取）");
  const chat = await fetch(BASE + "/api/ai/chat", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      messages: [{ role: "user", content: "我希望40岁退休" }],
    }),
  });
  // 消费 SSE 流（不关心回答内容，只验证记忆副作用）
  await chat.text().catch(() => {});
  const mem1 = await fetch(BASE + "/api/memory", { headers: headers() });
  const mem1Json = await mem1.json().catch(() => ({}));
  const retireMemory = (mem1Json.memories || []).find(
    (m) => m.type === "goal" && /40\s*岁|四十/.test(m.content) && /退休/.test(m.content)
  );
  assert(
    "对话中抽取并写入「40岁退休」目标记忆",
    !!retireMemory,
    retireMemory ? `「${retireMemory.content}」(importance=${retireMemory.importance})` : "未找到目标记忆"
  );

  // ── ④ 重新登录（新会话）→ 记忆仍持久存在 ──
  log("\n[④] 重新登录后记忆仍持久存在（模拟「一月后」）");
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const newCookie = cookieFrom(login.headers.get("set-cookie"));
  const mem2 = await fetch(BASE + "/api/memory", {
    headers: { cookie: newCookie },
  });
  const mem2Json = await mem2.json().catch(() => ({}));
  const retireMemory2 = (mem2Json.memories || []).find(
    (m) => m.type === "goal" && /40\s*岁|四十/.test(m.content) && /退休/.test(m.content)
  );
  assert(
    "新会话下「40岁退休」目标记忆仍在（服务端持久化）",
    !!retireMemory2 && !!newCookie,
    retireMemory2 ? `「${retireMemory2.content}」` : "记忆丢失"
  );

  // ── ⑤ 删除记忆后 AI 无法再读 ──
  log("\n[⑤] 删除记忆后不可再读");
  let deleteOk = false;
  let deleteDetail = "";
  if (retireMemory2) {
    const del = await fetch(BASE + `/api/memory/${retireMemory2.id}`, {
      method: "DELETE",
      headers: { cookie: newCookie },
    });
    const delJson = await del.json().catch(() => ({}));
    deleteOk = del.ok && delJson.ok;
    deleteDetail = `HTTP ${del.status}`;
  } else {
    deleteDetail = "无目标记忆可删";
  }
  const mem3 = await fetch(BASE + "/api/memory", {
    headers: { cookie: newCookie },
  });
  const mem3Json = await mem3.json().catch(() => ({}));
  const stillThere = (mem3Json.memories || []).some(
    (m) => m.type === "goal" && /40\s*岁|四十/.test(m.content) && /退休/.test(m.content)
  );
  assert("删除记忆接口成功", deleteOk, deleteDetail);
  assert("删除后该记忆不可再被检索到", !stillThere, stillThere ? "记忆仍在" : "已彻底移除");

  // ── 清理：清除该测试账户的残余记忆 ──
  await fetch(BASE + "/api/memory", {
    method: "DELETE",
    headers: { cookie: newCookie },
  }).catch(() => {});

  // ── 汇总 ──
  log("\n────────────────────────────────────────────────────────────");
  log(`  验收结果：${pass} 通过 / ${fail} 失败`);
  log("────────────────────────────────────────────────────────────");
  log(
    fail === 0
      ? "  🎉 Phase 6.6 验收全部通过：RAG 知识库与长期记忆系统工作正常。"
      : "  ⚠️  存在失败项，请查看上方 FAIL 明细并修复。"
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n[致命错误] ${e?.stack || e?.message || e}`);
  process.exit(3);
});
