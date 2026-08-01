/**
 * Phase 6.7 验收脚本 —— Multimodal Financial Intelligence 多模态财富数据理解
 * ───────────────────────────────────────────────────────────────────────────
 * 覆盖需求十四的 5 项端到端验收：
 *   ① 工资 PDF → 识别收入 → 确认 → 进财富画像（Twin 重算）
 *   ② 股票持仓理解 → 更新组合（截图端点集成/降级 + 持仓表确定性强确认）
 *   ③ 银行流水 CSV → 现金流分析（月支出 / 分类）
 *   ④ 删除文件 → AI 分析记录同步清除（权限解除）
 *   ⑤ 不同用户不可访问彼此资料（隔离）
 * 以及需求十二的 Document Hash 去重（同内容文件只分析一次）。
 *
 * 设计要点（与零依赖解析器约束对齐）：
 *   - PDF 文本抽取器以 latin1 读取流，中文会乱码，故工资 PDF 正文用 ASCII
 *     关键词（"Net Pay" / "Gross Salary" / "Basic Salary"）触发规则；
 *     文件名保留中文「工资单」以命中 payslip 类型。
 *   - CSV 表头用 HEADER_ALIASES 的中文别名（交易日期/摘要/商户/金额/收/支/余额）。
 *   - 文件类（PDF/CSV）走零 LLM 规则引擎，确定性可验收；
 *     图片类依赖用户 BYOM 视觉模型，脚本在无模型时验证「优雅降级、不崩溃」。
 *
 * 前置条件：开发服务器已在运行（默认 http://localhost:3000）。
 *   - 启动：cd "/f/FinOS AI" && NODE_OPTIONS="--use-system-ca" npm run dev
 *   - 自定义端口：BASE_URL=http://localhost:3010 node scripts/phase67-acceptance.mjs
 *
 * 说明：本脚本会注册两个一次性测试账户，跑完不清理（仅用于开发验收）。
 */

import zlib from "node:zlib";

const BASE = process.env.BASE_URL || "http://localhost:3000";

let pass = 0;
let fail = 0;
const lines = [];
function log(s) {
  lines.push(s);
  process.stdout.write(s + "\n");
}
function note(s) {
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

/* -------------------------------------------------------------------------- */
/*  构造测试样本                                                                */
/* -------------------------------------------------------------------------- */

/** 文本型工资 PDF（ASCII 正文，FlateDecode 压缩，供 extractPdfText 抽取）。 */
function buildPayslipPdf() {
  const text =
    "BT /F1 10 Tf\n72 360 Td\n(Employee Payroll - 2026-06) Tj\n" +
    "0 -20 Td (Gross Salary: 20000) Tj\n" +
    "0 -20 Td (Net Pay: 15000) Tj\n" +
    "0 -20 Td (Basic Salary: 12000) Tj\n" +
    "0 -20 Td (Pay Period: 2026-06) Tj\nET";
  const compressed = zlib.deflateSync(Buffer.from(text, "latin1"));
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.from("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"),
    Buffer.from("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"),
    Buffer.from(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
    ),
    Buffer.from(`4 0 obj\n<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`),
    compressed,
    Buffer.from("\nendstream\nendobj\n"),
    Buffer.from("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"),
    Buffer.from("trailer\n<< /Root 1 0 R >>\n%%EOF\n"),
  ]);
}

/** 1x1 透明 PNG（股票截图占位，验证图片端点集成 / 优雅降级）。 */
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64"
);

/** 银行流水 CSV（中文表头，金额带符号，收/支列）。 */
const BANK_CSV = `交易日期,摘要,商户,金额,收/支,余额
2026-06-01,工资入账,某某科技,15000,收,15000
2026-06-03,餐饮,麦当劳,-58,支,14942
2026-06-05,超市采购,永辉超市,-120,支,14822
2026-06-10,转账,朋友,-500,支,14322
2026-06-15,存款利息,某银行,12,收,14335
2026-06-20,网购,淘宝,-899,支,13436`;

/** 持仓表 CSV（名称/代码/份额/净值/市值）。 */
const HOLDINGS_CSV = `名称,代码,份额,净值,市值
贵州茅台,600519,100,1680,168000
宁德时代,300750,200,250,50000
易方达蓝筹,110011,1000,2.5,2500`;

/* -------------------------------------------------------------------------- */
/*  HTTP 辅助                                                                  */
/* -------------------------------------------------------------------------- */

async function register(email, password, name) {
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return { res: r, cookie: cookieFrom(r.headers.get("set-cookie")) };
}

async function uploadDoc(cookie, fileName, mimeType, buffer, category) {
  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: mimeType }), fileName);
  if (category) fd.append("category", category);
  const r = await fetch(BASE + "/api/documents", {
    method: "POST",
    headers: { cookie },
    body: fd,
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}

async function getDoc(cookie, docId) {
  const r = await fetch(`${BASE}/api/documents/${docId}`, { headers: { cookie } });
  return { res: r, json: await r.json().catch(() => ({})) };
}

async function deleteDoc(cookie, docId) {
  const r = await fetch(`${BASE}/api/documents/${docId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}

async function confirmDoc(cookie, docId) {
  const r = await fetch(`${BASE}/api/documents/${docId}/confirm`, {
    method: "POST",
    headers: { cookie },
  });
  return { res: r, json: await r.json().catch(() => ({})) };
}

/** 需求十一：向 AI 对话发送一条财富分析问题，解析 SSE 流中的 direct-reply。 */
async function chatAsk(cookie, question) {
  const r = await fetch(BASE + "/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  const text = await r.text();
  const events = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        events.push(JSON.parse(payload));
      } catch {
        /* 忽略非 JSON 行 */
      }
    }
  }
  return { res: r, events };
}

/* -------------------------------------------------------------------------- */
/*  主流程                                                                     */
/* -------------------------------------------------------------------------- */

async function main() {
  log("");
  log("══════════════════════════════════════════════════════════════");
  log("  FinOS AI · Phase 6.7 验收测试（多模态财富数据理解）");
  log(`  目标服务：${BASE}`);
  log("══════════════════════════════════════════════════════════════");

  // ── 健康检查（首次请求触发按需编译，放宽超时；接受 3xx 重定向为可达）──
  try {
    const h = await fetch(BASE + "/", { signal: AbortSignal.timeout(90000) });
    if (!h || h.status < 200 || h.status >= 500)
      throw new Error(`HTTP ${h?.status ?? "no-response"}`);
  } catch (e) {
    log(`\n[错误] 无法连接 ${BASE}：${e.message}`);
    log("请先启动开发服务器：NODE_OPTIONS=\"--use-system-ca\" npm run dev");
    process.exit(2);
  }
  log("  ✓ 服务可达");

  // ── 注册两个隔离测试账户（用户 A / 用户 B）──
  const emailA = `phase67a-${Date.now()}@finos.test`;
  const emailB = `phase67b-${Date.now()}@finos.test`;
  const password = "test1234";
  const regA = await register(emailA, password, "验收用户A");
  const regB = await register(emailB, password, "验收用户B");
  assert("注册用户A并写入会话", regA.res.ok && !!regA.cookie, `email=${emailA}`);
  assert("注册用户B并写入会话", regB.res.ok && !!regB.cookie, `email=${emailB}`);
  const cookieA = regA.cookie;
  const cookieB = regB.cookie;

  /* ──────────────────────────────────────────────────────────── */
  log("\n[①] 工资 PDF → 识别收入 → 确认 → 进财富画像");
  const pdf = buildPayslipPdf();
  const up1 = await uploadDoc(cookieA, "工资单-2026-06.pdf", "application/pdf", pdf, "salary");
  const doc1 = up1.json.document;
  const ana1 = up1.json.analysis;
  assert("上传工资 PDF 成功（200 + document）", up1.res.ok && !!doc1, `docId=${doc1?.id}`);
  assert(
    "识别为工资单类型（kind=payslip）",
    ana1?.kind === "payslip",
    `kind=${ana1?.kind}`
  );
  assert(
    "识别结果进入待确认状态（human-in-the-loop，不直接写画像）",
    ana1?.status === "needs_confirm",
    `status=${ana1?.status}`
  );
  const netIncome = ana1?.extracted?.incomes?.find((i) => i.label === "实发工资");
  assert(
    "规则抽取出实发工资收入项（Net Pay: 15000）",
    !!netIncome && netIncome.amount === 15000,
    `实发工资=${netIncome?.amount}`
  );
  assert(
    "月收入统计正确（monthlyIncome=15000）",
    ana1?.extracted?.stats?.monthlyIncome === 15000,
    `monthlyIncome=${ana1?.extracted?.stats?.monthlyIncome}`
  );
  // 需求八：数据来源标识；需求九：可信度评分（PDF 纯文本抽取 → 88）
  assert(
    "需求八：分析结果携带 source 来源标识（工资单→salary）",
    ana1?.source === "salary",
    `source=${ana1?.source}`
  );
  assert(
    "需求九：PDF 纯文本抽取可信度=88",
    ana1?.confidence === 88,
    `confidence=${ana1?.confidence}`
  );
  // 未确认前应不写画像：直接 confirm 并校验 Twin 重算
  const cf1 = await confirmDoc(cookieA, doc1.id);
  assert("用户确认写入财富画像成功", cf1.res.ok && cf1.json.ok, `status=${cf1.res.status}`);
  assert(
    "确认后状态变为 confirmed",
    cf1.json.analysis?.status === "confirmed",
    `status=${cf1.json.analysis?.status}`
  );
  assert(
    "工资收入已进入个人金融数据库（batch.transactionCount≥1）",
    (cf1.json.batch?.transactionCount ?? 0) >= 1,
    `transactionCount=${cf1.json.batch?.transactionCount}`
  );
  assert(
    "Financial Twin 已重算（applied + 净资产数值化）",
    cf1.json.twin?.applied === true && typeof cf1.json.twin?.netWorth === "number",
    `netWorth=${cf1.json.twin?.netWorth}`
  );
  // 二次读取确认持久化
  const re1 = await getDoc(cookieA, doc1.id);
  assert(
    "确认状态已持久化（GET 文档返回 confirmed）",
    re1.json.analysis?.status === "confirmed",
    `status=${re1.json.analysis?.status}`
  );

  /* ──────────────────────────────────────────────────────────── */
  log("\n[②] 股票持仓理解 → 更新组合");
  // ②a 截图端点集成 / 优雅降级
  const upImg = await uploadDoc(cookieA, "stock-screenshot.png", "image/png", PNG_1x1, "investment");
  const anaImg = upImg.json.analysis;
  const imgStatus = anaImg?.status;
  assert(
    "②a 截图上传不崩溃且返回有效分析状态",
    upImg.res.ok && ["needs_confirm", "failed", "processing"].includes(imgStatus),
    `status=${imgStatus}, visionUsed=${anaImg?.visionUsed}`
  );
  if (imgStatus === "failed") {
    assert(
      "②a 无视觉模型时给出可行动降级指引（而非 500 崩溃）",
      typeof anaImg?.error === "string" && anaImg.error.length > 0,
      anaImg?.error
    );
    note("   提示：截图→持仓完整路径需配置支持视觉(Vision)的模型；本环境验证优雅降级。");
  } else {
    note(`   提示：检测到视觉模型可用（visionUsed=${anaImg?.visionUsed}），截图已进入识别流程。`);
  }
  // 需求九：图片路径（Vision）可信度 ≤ 80（75 或 OCR 降级 60）
  if (anaImg?.status === "needs_confirm") {
    assert(
      "需求九：图片视觉识别可信度∈[0,100] 且偏低（≤80）",
      typeof anaImg?.confidence === "number" &&
        anaImg.confidence >= 0 &&
        anaImg.confidence <= 80,
      `confidence=${anaImg?.confidence}, visionUsed=${anaImg?.visionUsed}, ocrUsed=${anaImg?.ocrUsed}`
    );
  }

  // ②b 持仓表确定性强确认：验证「confirm → 更新组合」管线
  const upHold = await uploadDoc(cookieA, "holdings-2026-06.csv", "text/csv", Buffer.from(HOLDINGS_CSV), "investment");
  const docHold = upHold.json.document;
  const anaHold = upHold.json.analysis;
  assert("②b 上传持仓表成功", upHold.res.ok && !!docHold, `docId=${docHold?.id}`);
  assert(
    "②b 识别为持仓类型（kind=holdings）",
    anaHold?.kind === "holdings",
    `kind=${anaHold?.kind}, source=${anaHold?.source}`
  );
  assert(
    "②b 抽取出 3 条持仓",
    (anaHold?.extracted?.holdings?.length ?? 0) === 3,
    `holdings=${anaHold?.extracted?.holdings?.length}`
  );
  // 需求八 / 九：结构化表格（CSV 持仓）→ source=stock，confidence=95
  assert(
    "需求八：持仓表来源标识 source=stock",
    anaHold?.source === "stock",
    `source=${anaHold?.source}`
  );
  assert(
    "需求九：结构化 CSV 表格可信度=95",
    anaHold?.confidence === 95,
    `confidence=${anaHold?.confidence}`
  );
  assert(
    "②b 识别结果进入待确认状态",
    anaHold?.status === "needs_confirm",
    `status=${anaHold?.status}`
  );
  const cfHold = await confirmDoc(cookieA, docHold.id);
  assert(
    "②b 确认写入组合成功",
    cfHold.res.ok && cfHold.json.ok,
    `status=${cfHold.res.status}`
  );
  assert(
    "②b 持仓已进入个人金融数据库（batch.holdingCount=3）",
    (cfHold.json.batch?.holdingCount ?? 0) === 3,
    `holdingCount=${cfHold.json.batch?.holdingCount}`
  );
  assert(
    "②b Financial Twin 重算（组合已更新）",
    cfHold.json.twin?.applied === true && typeof cfHold.json.twin?.totalAssets === "number",
    `totalAssets=${cfHold.json.twin?.totalAssets}`
  );

  /* ──────────────────────────────────────────────────────────── */
  log("\n[③] 银行流水 CSV → 现金流分析");
  const upBank = await uploadDoc(cookieA, "bank-statement-2026-06.csv", "text/csv", Buffer.from(BANK_CSV), "asset_proof");
  const docBank = upBank.json.document;
  const anaBank = upBank.json.analysis;
  assert("上传银行流水成功", upBank.res.ok && !!docBank, `docId=${docBank?.id}`);
  assert(
    "识别为银行流水类型（kind=bank-statement）",
    anaBank?.kind === "bank-statement",
    `kind=${anaBank?.kind}`
  );
  assert(
    "抽取出 ≥5 条交易",
    (anaBank?.extracted?.transactions?.length ?? 0) >= 5,
    `transactions=${anaBank?.extracted?.transactions?.length}`
  );
  assert(
    "现金流分析产出月均支出（monthlyExpense>0）",
    (anaBank?.extracted?.stats?.monthlyExpense ?? 0) > 0,
    `monthlyExpense=${anaBank?.extracted?.stats?.monthlyExpense}`
  );
  // 需求八 / 九：银行流水 CSV → source=bank-csv，confidence=95
  assert(
    "需求八：银行流水来源标识 source=bank-csv",
    anaBank?.source === "bank-csv",
    `source=${anaBank?.source}`
  );
  assert(
    "需求九：银行流水 CSV 可信度=95",
    anaBank?.confidence === 95,
    `confidence=${anaBank?.confidence}`
  );
  // 确认写入，验证现金流进入 Twin
  const cfBank = await confirmDoc(cookieA, docBank.id);
  assert(
    "银行流水确认写入成功",
    cfBank.res.ok && cfBank.json.ok,
    `status=${cfBank.res.status}`
  );
  assert(
    "确认后 Twin 重算（现金流已并入净资产）",
    cfBank.json.twin?.applied === true && typeof cfBank.json.twin?.netWorth === "number",
    `netWorth=${cfBank.json.twin?.netWorth}`
  );

  // 需求十二：Document Hash 去重（同内容只分析一次）
  log("\n[⑥ 需求十二] Document Hash 去重（同内容文件只分析一次）");
  const upDup = await uploadDoc(cookieA, "bank-statement-copy.csv", "text/csv", Buffer.from(BANK_CSV), "asset_proof");
  assert(
    "同内容重复上传命中缓存（cached=true，未重复消耗 AI）",
    upDup.json.cached === true && !!upDup.json.analysis,
    `cached=${upDup.json.cached}, docId=${upDup.json.document?.id}`
  );
  assert(
    "去重后复用同一文件哈希",
    upDup.json.analysis?.hash === anaBank?.hash,
    `hash=${upDup.json.analysis?.hash?.slice(0, 12)}…`
  );
  // 需求十二 + 八/九：去重复用的分析仍携带 confidence 与 source
  assert(
    "去重结果保留可信度与来源标识",
    upDup.json.analysis?.confidence === 95 &&
      upDup.json.analysis?.source === "bank-csv",
    `confidence=${upDup.json.analysis?.confidence}, source=${upDup.json.analysis?.source}`
  );

  /* ──────────────────────────────────────────────────────────── */
  log("\n[④] 删除文件 → AI 分析记录同步清除（权限解除）");
  const del = await deleteDoc(cookieA, docBank.id);
  assert(
    "删除文档接口成功",
    del.res.ok && del.json.ok === true,
    `clearedAnalyses=${del.json.clearedAnalyses}`
  );
  const afterDel = await getDoc(cookieA, docBank.id);
  assert(
    "删除后文档不可再访问（GET 返回 404）",
    afterDel.res.status === 404,
    `status=${afterDel.res.status}`
  );
  // 列出文档，确认已无该文档
  const listAfter = await fetch(`${BASE}/api/documents`, { headers: { cookie: cookieA } });
  const listJson = await listAfter.json().catch(() => ({}));
  const stillListed = (listJson.documents ?? []).some((d) => d.id === docBank.id);
  assert("删除后该文档从列表消失", !stillListed, `剩余文档数=${(listJson.documents ?? []).length}`);

  /* ──────────────────────────────────────────────────────────── */
  log("\n[⑤] 不同用户不可访问彼此资料（隔离）");
  // 用户 A 的持仓文档 docHold 应仍可见
  const aSeeHold = await getDoc(cookieA, docHold.id);
  assert("用户A 可访问自己的资料", aSeeHold.res.ok && !!aSeeHold.json.document, `status=${aSeeHold.res.status}`);
  // 用户 B 访问用户 A 的文档 → 应 404（隔离）
  const bSeeHold = await getDoc(cookieB, docHold.id);
  assert(
    "用户B 无法访问用户A 的资料（GET 返回 404）",
    bSeeHold.res.status === 404,
    `status=${bSeeHold.res.status}`
  );
  // 用户 B 列表不含用户 A 的文档
  const listB = await fetch(`${BASE}/api/documents`, { headers: { cookie: cookieB } });
  const listBJson = await listB.json().catch(() => ({}));
  const bHasA = (listBJson.documents ?? []).some((d) => d.id === docHold.id);
  assert("用户B 的文档列表不含用户A 的资料", !bHasA, `B的文档数=${(listBJson.documents ?? []).length}`);
  // 反向：用户 A 也不可访问用户 B 刚上传的资料
  const upB = await uploadDoc(cookieB, "b-private.csv", "text/csv", Buffer.from(BANK_CSV), "asset_proof");
  const docB = upB.json.document;
  const aSeeB = await getDoc(cookieA, docB.id);
  assert(
    "用户A 无法访问用户B 的资料（反向隔离）",
    aSeeB.res.status === 404,
    `status=${aSeeB.res.status}`
  );

  /* ──────────────────────────────────────────────────────────── */
  log("\n[⑦ 需求十一] 无真实数据禁止生成财富分析（chat + monitor 双入口）");
  // 注册用户 C，创建「空画像」（全零）→ 命中 isEmptyProfile
  const emailC = `phase67c-${Date.now()}@finos.test`;
  const regC = await register(emailC, password, "验收用户C");
  assert("注册用户C", regC.res.ok && !!regC.cookie, `email=${emailC}`);
  const cookieC = regC.cookie;
  const profC = await fetch(BASE + "/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieC },
    body: JSON.stringify({ age: 0, monthlyIncome: 0, totalAssets: 0, goals: ["retire"] }),
  });
  assert("用户C 创建空画像（全零，触发 isEmptyProfile）", profC.ok, `status=${profC.status}`);

  // 7a monitor 入口：应 403 且返回统一文案
  const monC = await fetch(BASE + "/api/ai/monitor", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieC },
    body: JSON.stringify({ runAgents: false }),
  });
  const monCjson = await monC.json().catch(() => ({}));
  assert(
    "需求十一：空画像调用 monitor 被拦截（403，不生成分析）",
    monC.status === 403,
    `status=${monC.status}`
  );
  assert(
    "需求十一：拦截文案为「你的财富数据还未完善，请添加资产信息后开始分析。」",
    monCjson.message === "你的财富数据还未完善，请添加资产信息后开始分析。",
    `message=${monCjson.message}`
  );

  // 7b chat 入口：财富分析问题应返回统一文案（不臆造分析）
  const chatC = await chatAsk(cookieC, "我的现金流怎么样？");
  const replyC = chatC.events.find(
    (e) => e.type === "direct-reply" && e.intent === "financial_analysis"
  );
  assert(
    "需求十一：空画像对话财富分析被拦截并返回 direct-reply",
    !!replyC,
    `events=${chatC.events.length}`
  );
  assert(
    "需求十一：对话拦截文案与统一文案一致",
    !!replyC && replyC.content === "你的财富数据还未完善，请添加资产信息后开始分析。",
    `content=${replyC?.content}`
  );

  // ── 汇总 ──
  log("\n────────────────────────────────────────────────────────────");
  log(`  验收结果：${pass} 通过 / ${fail} 失败`);
  log("────────────────────────────────────────────────────────────");
  log(
    fail === 0
      ? "  🎉 Phase 6.7 验收全部通过：多模态财富数据理解（PDF/CSV/图片 → 识别 → 确认 → 进画像 → Twin 重算 → 隔离）工作正常。"
      : "  ⚠️  存在失败项，请查看上方 FAIL 明细并修复。"
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n[致命错误] ${e?.stack || e?.message || e}`);
  process.exit(3);
});
