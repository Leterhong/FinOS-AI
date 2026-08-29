/**
 * 前端契约测试（Node 内置 test runner，零额外依赖）。
 *
 * 这些是静态源码级约束——它们不检查 UI 长什么样，而是守住那些
 * 「一旦破坏就会引发生产事故或违背产品原则」的硬性规则。
 *
 * 运行：node --test tests/frontend/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "src");

/** 递归收集源码文件 */
function walk(dir, exts = [".ts", ".tsx"], acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (["node_modules", ".next", "__pycache__"].includes(name)) continue;
      walk(full, exts, acc);
    } else if (exts.includes(extname(name))) {
      acc.push(full);
    }
  }
  return acc;
}

const FILES = walk(SRC);
const read = (f) => readFileSync(f, "utf8");
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");

// ---------------------------------------------------------------- 后端通道唯一性
test("所有后端调用必须经由 backend-client（唯一通道）", () => {
  const offenders = [];
  for (const file of FILES) {
    const path = rel(file);
    if (path.includes("src/lib/backend-client")) continue; // 通道自身
    if (path.startsWith("src/app/api/")) continue; // Next 路由处理器属于服务端
    const text = read(file);
    // 直接硬编码后端地址是禁止的
    if (/fetch\(\s*[`'"]https?:\/\/(localhost|127\.0\.0\.1):8300/.test(text)) {
      offenders.push(`${path}: 硬编码后端地址`);
    }
  }
  assert.deepEqual(offenders, [], `发现绕过 backendApi 的直连:\n${offenders.join("\n")}`);
});

// ---------------------------------------------------------------- 品牌与视觉红线
test("禁止紫色系品牌色（品牌主色为 #00D68F 绿）", () => {
  const bannedHex = /#(6b46c1|7c3aed|8b5cf6|a855f7|9333ea|c084fc|a78bfa)/i;
  const offenders = [];
  for (const file of FILES) {
    const text = read(file);
    const m = text.match(bannedHex);
    if (m) offenders.push(`${rel(file)}: ${m[0]}`);
  }
  assert.deepEqual(offenders, [], `发现紫色硬编码:\n${offenders.join("\n")}`);
});

test("涨跌配色遵循中国市场惯例（涨红跌绿）", () => {
  const hasUpDown = FILES.some((f) => /updownClass|upDownClass/.test(read(f)));
  assert.ok(hasUpDown, "缺少统一的涨跌配色助手 updownClass，各处自行写色值会导致口径不一致");
});

// ---------------------------------------------------------------- 合规文案
test("禁止「绝对安全 / 百分百 / 保证收益」等违规承诺（否定语境除外）", () => {
  const banned = ["绝对安全", "百分百", "100%安全", "完全安全", "保证收益", "稳赚不赔", "稳赚", "必涨"];
  // 出现在否定/禁止语境中是正确的合规写法，例如「禁止保证收益」「不使用『稳赚』」
  const negation = /(不得|不能|不会|不可|禁止|严禁|勿|避免|杜绝|拒绝|没有|并非|不是|不承诺|不保证|不提供|不使用|绝不)/;
  const offenders = [];
  for (const file of FILES) {
    read(file)
      .split("\n")
      .forEach((line, i) => {
        for (const word of banned) {
          if (!line.includes(word)) continue;
          const before = line.slice(0, line.indexOf(word));
          // 同一行出现否定词（含紧邻的单字「不 / 无 / 非 / 勿 / 免」），
          // 或该词被引号包裹（作为「反面示例」列举）→ 视为合规
          const quoted = new RegExp(`[「『"'"']${word}`).test(line);
          if (negation.test(before) || /[不无非勿免]$/.test(before) || quoted) continue;
          offenders.push(`${rel(file)}:${i + 1}: ${word}`);
        }
      });
  }
  assert.deepEqual(offenders, [], `发现违规承诺表述:\n${offenders.join("\n")}`);
});

test("免责声明文案存在且口径统一", () => {
  const target = "FinOS AI提供信息分析和辅助决策，不构成投资建议";
  const found = FILES.some((f) => read(f).includes(target));
  assert.ok(found, `前端缺少标准免责声明：「${target}。」`);
});

// ---------------------------------------------------------------- 开源定位红线
test("不得包含商业套餐 / 支付 / 订阅收费代码", () => {
  const banned = [
    "stripe", "alipay.com/gateway", "wxpay", "createCheckoutSession",
    "subscriptionPlan", "billingCycle", "upgradeToPro", "pricingTier",
  ];
  const offenders = [];
  for (const file of FILES) {
    const text = read(file).toLowerCase();
    for (const word of banned) {
      if (text.includes(word.toLowerCase())) offenders.push(`${rel(file)}: ${word}`);
    }
  }
  assert.deepEqual(offenders, [], `FinOS AI 是开源企业金融 Agent，不得引入收费系统:\n${offenders.join("\n")}`);
});

// ---------------------------------------------------------------- 企业 AI 主链路与零数据原则
test("企业工作区不得包含预置业务数据或旧版引导接口", () => {
  assert.equal(existsSync(join(SRC, "data", "enterprise-demo.ts")), false, "enterprise-demo.ts 必须删除");
  assert.equal(existsSync(join(SRC, "app", "api", "demo", "bootstrap", "route.ts")), false, "旧版 demo bootstrap API 必须删除");
  const store = read(join(SRC, "store", "enterprise-store.ts"));
  for (const collection of ["cases", "documents", "risks", "agents", "tasks", "rules", "briefs"]) {
    assert.match(store, new RegExp(`${collection}: \\[\\]`), `${collection} 必须从空数组启动`);
  }
  assert.match(store, /migrate:\s*\(\)\s*=>\s*emptyWorkspace\(\)/, "旧持久化版本必须迁移为空工作区");
});

test("企业 AI 页面必须调用服务端模型网关", () => {
  const assistant = read(join(SRC, "app", "(dashboard)", "assistant", "page.tsx"));
  const agents = read(join(SRC, "app", "(dashboard)", "agents", "page.tsx"));
  const research = read(join(SRC, "app", "(dashboard)", "research", "page.tsx"));
  const documents = read(join(SRC, "app", "(dashboard)", "documents", "page.tsx"));
  assert.match(assistant, /callEnterpriseAI/);
  assert.match(agents, /callEnterpriseAI/);
  assert.match(research, /callEnterpriseAI/);
  assert.match(documents, /analyzeEnterpriseDocument/);
  assert.ok(existsSync(join(SRC, "app", "api", "enterprise", "ai", "route.ts")));
  assert.ok(existsSync(join(SRC, "app", "api", "enterprise", "ai", "document", "route.ts")));
});

test("模型中心必须可见且模型 API 只信任服务端工作区会话", () => {
  const sidebar = read(join(SRC, "components", "dashboard", "Sidebar.tsx"));
  assert.match(sidebar, /href:\s*["']\/models["']/, "侧边栏必须提供 AI 模型入口");
  const modelApi = read(join(SRC, "app", "api", "models", "route.ts"));
  assert.match(modelApi, /getSessionUserId/);
  assert.ok(!/modelConfigStore\.add\(body\.userId/.test(modelApi), "禁止信任客户端传入 userId");
  const modelStore = read(join(SRC, "ai", "model-center", "models", "store.ts"));
  assert.match(modelStore, /encryptApiKey/);
  assert.match(modelStore, /keyMask:\s*mask/);
});

// ---------------------------------------------------------------- 安全红线
test("Cookie secure 标志必须按请求协议动态判断，不得写死 NODE_ENV", () => {
  const sessionFile = join(SRC, "auth", "session.ts");
  if (!existsSync(sessionFile)) return;
  const text = read(sessionFile);
  assert.ok(
    /isSecureContext/.test(text),
    "session.ts 必须使用 isSecureContext(req) 判断；写死 NODE_ENV==='production' 会让 HTTP 部署下 cookie 无法写入，造成登录死循环",
  );
  assert.ok(
    !/secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/.test(text),
    "禁止 secure: process.env.NODE_ENV === 'production' —— 这是已知的登录死循环根因",
  );
});

test("不得在前端源码硬编码真实密钥", () => {
  const patterns = [
    /sk-[A-Za-z0-9]{20,}/,          // OpenAI 风格
    /AKIA[0-9A-Z]{16}/,             // AWS Access Key
    /gh[pousr]_[A-Za-z0-9]{30,}/,   // GitHub Token
    /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  ];
  const offenders = [];
  for (const file of FILES) {
    const text = read(file);
    for (const re of patterns) {
      if (re.test(text)) offenders.push(`${rel(file)}: 疑似硬编码密钥`);
    }
  }
  assert.deepEqual(offenders, [], `发现疑似密钥:\n${offenders.join("\n")}`);
});

test("开发兜底密钥必须在生产环境 fail-fast", () => {
  // 本项目开源，DEV_FALLBACK_SECRET 对所有人可见。
  // 若生产环境缺失真实密钥时静默回退到它，加密等同于无效。
  // 守卫可以是文件内联判断，也可以走集中式 resolveSecretOrThrow（secret-guard.ts）。
  const guardModule = join(SRC, "security", "secret-guard.ts");
  const centralizedOk =
    existsSync(guardModule) &&
    /NODE_ENV\s*===\s*["']production["']/.test(read(guardModule)) &&
    /throw new Error/.test(read(guardModule));
  const offenders = [];
  for (const file of FILES) {
    const text = read(file);
    if (!text.includes("DEV_FALLBACK_SECRET")) continue;
    const inlineGuard =
      /NODE_ENV\s*===\s*["']production["']/.test(text) && /throw new Error/.test(text);
    const usesCentralized = /resolveSecretOrThrow/.test(text);
    if (!inlineGuard && !(centralizedOk && usesCentralized)) offenders.push(rel(file));
  }
  assert.deepEqual(
    offenders,
    [],
    `以下文件使用了开发兜底密钥但缺少生产环境启动守卫:\n${offenders.join("\n")}`,
  );
});

// ---------------------------------------------------------------- 类型安全
test("TypeScript 严格模式必须开启", () => {
  const text = read(join(ROOT, "tsconfig.json"));
  assert.match(text, /"strict"\s*:\s*true/, "tsconfig.json 必须开启 strict");
  assert.ok(!/"strict"\s*:\s*false/.test(text), "tsconfig.json 不得关闭 strict");
});

// ---------------------------------------------------------------- 空值防御
test("列表渲染前须做空值兜底（?? [] 或显式判空）", () => {
  const offenders = [];
  for (const file of FILES) {
    const text = read(file);
    // data.xxx.map( 且同一行没有 ?? [] / ?. 的裸调用
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (/\bdata\.[a-zA-Z]+\.map\(/.test(line) && !/\?\?|\?\./.test(line)) {
        offenders.push(`${rel(file)}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `后端字段缺失时会直接白屏，请改用 (data.xxx ?? []).map:\n${offenders.join("\n")}`,
  );
});
