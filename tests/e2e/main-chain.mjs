/**
 * 主链路端到端测试（不依赖真实模型服务）。
 *
 * 覆盖两条链路：
 *  A. Web（Next.js 生产服务器）：
 *     工作区会话 → 模型配置/连通测试（指向本地 mock LLM）→ 企业 AI 对话
 *     → SSE 流式 → 资料上传两段式研判（事实抽取 + 确定性规则命中）
 *  B. 后端（FastAPI）：
 *     bootstrap 访客会话 → 企业对象 upsert → 快照读取（服务端持久化链路）
 *
 * 前置：`npm run build` 已完成；本脚本负责拉起/关闭全部子进程。
 * 运行：node tests/e2e/main-chain.mjs
 */
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WEB_PORT = 3100;
const BACKEND_PORT = 8300;
const MOCK_PORT = 18971;
const PYTHON = process.env.E2E_PYTHON || "python";  // 后端需要 3.11+，可通过环境变量指定解释器
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const BACKEND = `http://127.0.0.1:${BACKEND_PORT}`;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;

const children = [];
const results = [];

function ok(name, condition, detail = "") {
  results.push({ name, pass: Boolean(condition), detail });
  console.log(`${condition ? "✔" : "✖"} ${name}${condition ? "" : ` — ${detail}`}`);
}

let mockServer = null;

/** 同步停止全部子进程：Windows 下 shell:true 必须树杀，否则 next-server 变孤儿。 */
function stopChildren() {
  try {
    // closeAllConnections：断开 keep-alive 空闲连接，确保 close() 立即生效。
    mockServer?.closeAllConnections?.();
    mockServer?.close();
  } catch {
    // ignore
  }
  for (const child of children) {
    try {
      if (process.platform === "win32" && child.pid) {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // 进程可能已退出
    }
  }
}

async function waitReady(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok || resp.status === 404) return;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} 未在 ${timeoutMs}ms 内就绪: ${url}`);
}

function startProcess(name, cmd, args, env, readyUrl, { shell = process.platform === "win32" } = {}) {
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell,
  });
  child.stdout.on("data", (d) => process.env.E2E_VERBOSE && console.log(`[${name}] ${d}`.trimEnd()));
  child.stderr.on("data", (d) => process.env.E2E_VERBOSE && console.log(`[${name}!] ${d}`.trimEnd()));
  children.push(child);
  return child;
}

/** 本地 mock OpenAI 兼容服务：按请求特征返回抽取 JSON / 普通叙述。 */
function startMockLLM() {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      let requestText = "";
      try {
        const parsed = JSON.parse(body || "{}");
        requestText = JSON.stringify(parsed.messages ?? []);
      } catch {
        requestText = body;
      }
      if (requestText.includes("事实抽取 Agent")) {
        res.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            facts: [
              { topic: "货币资金", value: 100, unit: "万元", quote: "货币资金 100 万元" },
            ],
            uncertainties: ["审计报告尚未取得"],
          }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }));
        return;
      }
      res.end(JSON.stringify({
        choices: [{ message: { content: "MOCK 分析：货币资金充足，未见重大风险。" } }],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      }));
    });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => {
    mockServer = server;
    resolve(server);
  }));
}

async function phaseA() {
  // 1. 工作区会话
  const session = await fetch(`${WEB}/api/workspace/session`, { method: "POST" });
  ok("A1 工作区会话建立", session.status === 200 || session.status === 201, `status=${session.status}`);
  const cookie = session.headers.get("set-cookie")?.split(";")[0] ?? "";

  // 2. 配置模型（指向 mock）并测试连通
  const add = await fetch(`${WEB}/api/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      providerName: "openai-compatible",
      displayName: "Mock 模型",
      modelId: "mock-model",
      baseUrl: `${MOCK}/v1`,
      apiKey: "sk-e2e-test",
    }),
  });
  ok("A2 模型配置保存", add.status === 201, `status=${add.status}`);
  const { model } = await add.json();
  const test = await fetch(`${WEB}/api/models/${model.id}/test`, {
    method: "POST",
    headers: { cookie },
  });
  const testBody = await test.json();
  ok("A3 模型连通测试通过", testBody?.result?.ok === true, JSON.stringify(testBody).slice(0, 200));

  // 3. 企业 AI 对话（非流式）
  const chat = await fetch(`${WEB}/api/enterprise/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ question: "当前经营情况如何？", mode: "chat", context: { cases: [], documents: [], rules: [], risks: [] } }),
  });
  const chatBody = await chat.json();
  ok("A4 企业 AI 对话返回 mock 内容", chatBody?.result?.answer?.includes("MOCK") === true, JSON.stringify(chatBody).slice(0, 200));

  // 4. SSE 流式
  const stream = await fetch(`${WEB}/api/enterprise/ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ question: "流式测试", mode: "chat", stream: true, context: { cases: [], documents: [], rules: [], risks: [] } }),
  });
  ok("A5 流式响应为 SSE", (stream.headers.get("content-type") || "").includes("text/event-stream"), String(stream.headers.get("content-type")));
  const streamText = await stream.text();
  const hasDelta = streamText.split("\n").some((l) => l.startsWith("data:") && l.includes("delta"));
  const hasDone = streamText.split("\n").some((l) => l.startsWith("data:") && l.includes("done"));
  ok("A6 流式包含 delta 与 done 事件", hasDelta && hasDone);

  // 5. 资料两段式研判：事实抽取 + 确定性规则命中
  const form = new FormData();
  form.set("file", new File(["货币资金 100 万元\n应收账款 30 万元"], "balance.csv", { type: "text/csv" }));
  form.set("project", JSON.stringify({ company: "测试制造有限公司" }));
  form.set("rules", JSON.stringify([
    { code: "LR-001", name: "货币资金低于 200 万预警", domain: "授信",
      conditions: [{ metric: "货币资金", op: "lt", value: 2_000_000 }] },
  ]));
  const doc = await fetch(`${WEB}/api/enterprise/ai/document`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  const docBody = await doc.json();
  const facts = docBody?.result?.facts ?? [];
  const hits = docBody?.result?.ruleHits ?? [];
  ok("A7 资料抽取返回结构化事实（含引用）", facts.length === 1 && facts[0].quote === "货币资金 100 万元", JSON.stringify(docBody).slice(0, 300));
  ok("A8 规则引擎确定性命中（100万 < 200万）", hits.length === 1 && hits[0].hit === true, JSON.stringify(hits));
}

async function phaseB() {
  // 1. 访客会话
  const boot = await fetch(`${BACKEND}/api/auth/bootstrap`, { method: "POST" });
  const bootBody = await boot.json();
  const token = bootBody?.data?.token;
  ok("B1 后端访客会话", boot.status === 200 && Boolean(token), JSON.stringify(bootBody).slice(0, 120));
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  // 2. 企业对象 upsert + 快照读取（服务端持久化）
  const caseId = `CASE-E2E-${Date.now().toString(36)}`;
  const upsert = await fetch(`${BACKEND}/api/enterprise/cases`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ id: caseId, company: "E2E 制造有限公司", title: "主链路验证", progress: 30 }),
  });
  ok("B2 项目 upsert", upsert.status === 200, String(upsert.status));
  const snap = await fetch(`${BACKEND}/api/enterprise/snapshot`, { headers: auth });
  const snapBody = await snap.json();
  ok("B3 快照包含刚写入的项目", (snapBody?.data?.cases ?? []).some((c) => c.id === caseId));

  // 3. 跨用户隔离：新访客看不到前一个访客的项目
  const boot2 = await fetch(`${BACKEND}/api/auth/bootstrap`, { method: "POST" });
  const token2 = (await boot2.json())?.data?.token;
  const snap2 = await fetch(`${BACKEND}/api/enterprise/snapshot`, {
    headers: { Authorization: `Bearer ${token2}` },
  }).then((r) => r.json());
  ok("B4 用户隔离（新会话不可见他人项目）", !(snap2?.data?.cases ?? []).some((c) => c.id === caseId));
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), "finos-e2e-"));
  try {
    await startMockLLM();
    console.log("mock LLM ready");

    startProcess("backend", PYTHON, ["-m", "uvicorn", "backend.main:app", "--port", String(BACKEND_PORT)], {
      ENV: "test",
      DATABASE_URL: `sqlite:///${join(tmp, "e2e.db").replace(/\\/g, "/")}`,
      ENCRYPTION_MASTER_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY",
      AI_ALLOW_PRIVATE_ENDPOINTS: "true",
    }, `${BACKEND}/api/health`, { shell: false });
    await waitReady(`${BACKEND}/api/health`, "FastAPI");

    // 直接以 node 启动 next（不经 npm），保证进程树可被精确终止。
    startProcess("web", process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(WEB_PORT)], {
      FINOS_DATA_KEY: "e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e",
      FINOS_ALLOW_PRIVATE_AI_ENDPOINTS: "true",
    }, `${WEB}/models`, { shell: false });
    await waitReady(`${WEB}/models`, "Next.js");

    await phaseA();
    await phaseB();
  } finally {
    for (const child of children) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    setTimeout(() => rmSync(tmp, { recursive: true, force: true }), 1000);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\nE2E 完成：${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("E2E 运行失败:", error);
  stopChildren();
  process.exit(1);
});
