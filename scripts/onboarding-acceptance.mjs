// scripts/onboarding-acceptance.mjs
// Financial Twin Onboarding 端到端验收脚本（Financial Twin 6.x）
//
// 覆盖验收项：
//  ① 注册 → 提交完整财富画像 → profileCompleted=true（真实数据驱动，非 Demo）
//  ② Dashboard 真实数据：画像姓名/资产等于用户输入，绝不含 Alex Chen / 1280420
//  ③ 画像文件落盘为 AES-256-GCM 加密信封（非明文）
//  ④ /demo 路由已删除（404）
//  ⑤ 受保护路由 /onboarding/wealth 未登录重定向（307）
//  ⑥ 文档上传 / 列表 / 删除 闭环
//
// 用法：
//   1) 先启动 dev server： NODE_OPTIONS="--use-system-ca" npm run dev
//   2) 确认实际端口后运行： node scripts/onboarding-acceptance.mjs [BASE_URL]
//      （缺省 http://localhost:3000）
//
// 脚本会创建临时测试用户，结束时清理其产生的 .data 文件，避免污染。

import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:3000";
const ROOT = process.cwd();
const results = [];
const cleanup = [];

function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? "  —  " + detail : ""}`);
}

function extractSession(res) {
  const sc = res.headers.get("set-cookie");
  if (!sc) return null;
  const m = sc.match(/finos_session=([^;]+)/);
  return m ? m[1] : null;
}

const email = `accept+${Date.now()}@finos.test`;
const password = "accept123";
const displayName = "验收测试用户";

async function main() {
  // ① 公开路由探活
  let r = await fetch(`${BASE}/login`);
  check("GET /login 返回 200", r.status === 200, `status=${r.status}`);

  // ⑤ 受保护路由未登录应重定向到 login（307）
  r = await fetch(`${BASE}/onboarding/wealth`, { redirect: "manual" });
  check("未登录访问 /onboarding/wealth 重定向(307)", r.status === 307, `status=${r.status}`);

  // ④ /demo 路由已删除 —— 已登录访问应 404（未登录会被 middleware 拦成 307，故放登录后测）
  // （先注册登录，最后再测 /demo 404）

  // ② 注册
  r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: displayName }),
  });
  const reg = await r.json().catch(() => ({}));
  const cookie = extractSession(r);
  const userId = reg.user?.id;
  check("注册成功 ok=true", reg.ok === true, JSON.stringify(reg).slice(0, 90));
  check("注册返回 userId", !!userId);
  check("会话 cookie(finos_session)已下发", !!cookie);
  if (!cookie || !userId) {
    return finish();
  }
  cleanup.push(["user", userId]);

  // 提交完整财富画像（真实数据，绝不含默认值）
  const wealthBody = {
    age: 34,
    income: 30000,
    name: displayName,
    occupation: "工程师",
    city: "深圳",
    maritalStatus: "married",
    children: 1,
    familyNote: "双职工家庭",
    incomeSources: ["salary", "investment"],
    incomeStability: "stable",
    expense: 12000,
    investment: 5000,
    assets: {
      cash: 100000,
      deposits: 200000,
      stocks: 150000,
      funds: 80000,
      bonds: 50000,
      realEstate: 2000000,
      other: 0,
    },
    liabilities: {
      mortgage: 1200000,
      carLoan: 80000,
      creditLoan: 0,
      loans: 0,
      other: 0,
    },
    goals: {
      type: "retirement",
      retirementAge: 60,
      targetAmount: 5000000,
      targetYears: 26,
      lifeGoal: "安稳退休",
    },
  };
  r = await fetch(`${BASE}/api/profile/wealth`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `finos_session=${cookie}` },
    body: JSON.stringify(wealthBody),
  });
  const submit = await r.json().catch(() => ({}));
  check("提交财富画像 200 + 返回 wealthProfile", r.status === 200 && !!submit.wealthProfile, `status=${r.status}`);
  check("画像姓名来自真实输入(=验收测试用户)", submit.wealthProfile?.name === displayName);
  check("画像现金=真实输入 100000", submit.wealthProfile?.assets?.cash === 100000);
  check("画像姓名绝非 Alex Chen", submit.wealthProfile?.name !== "Alex Chen");
  check("画像退休年龄=真实输入 60(非默认)", submit.wealthProfile?.goals?.retirementAge === 60);

  // profileCompleted 同步校验（读账户文件）
  const userFile = join(ROOT, ".data", "users", `${userId}.json`);
  if (existsSync(userFile)) {
    const acc = JSON.parse(readFileSync(userFile, "utf-8"));
    check("账户 profileCompleted 已置为 true", acc.profileCompleted === true);
    check("账户文件不含 Alex Chen", !JSON.stringify(acc).includes("Alex Chen"));
  } else {
    check("账户文件存在", false, userFile);
  }

  // GET 回读确认画像已完成
  r = await fetch(`${BASE}/api/profile/wealth`, {
    headers: { cookie: `finos_session=${cookie}` },
  });
  const getW = await r.json().catch(() => ({}));
  check("GET /api/profile/wealth 返回 completed=true", getW.wealthProfile?.completed === true);

  // ③ 加密落盘校验
  const fp = join(ROOT, ".data", "financial_profiles", `${userId}.json`);
  check("加密画像文件存在", existsSync(fp));
  if (existsSync(fp)) {
    const raw = readFileSync(fp, "utf-8");
    let parsed;
    try { parsed = JSON.parse(raw); } catch {}
    const isEnv = parsed && parsed.alg === "aes-256-gcm" && parsed.iv && parsed.tag && parsed.data;
    check("画像文件为 AES-256-GCM 加密信封(非明文)", !!isEnv, isEnv ? "alg=AES-256-GCM" : "非加密 JSON");
    check("加密文件不含明文姓名/邮箱", !raw.includes(displayName) && !raw.includes(email));
  }

  // ④ /demo 已登录访问 → 404（带 cookie 绕过登录态重定向，验证路由已删除）
  r = await fetch(`${BASE}/demo`, {
    redirect: "manual",
    headers: { cookie: `finos_session=${cookie}` },
  });
  check("GET /demo 返回 404(路由已删除)", r.status === 404, `status=${r.status}`);

  // ⑥ 文档上传 / 列表 / 删除
  const pdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF";
  const fd = new FormData();
  fd.append("file", new Blob([pdf], { type: "application/pdf" }), "payslip.pdf");
  fd.append("category", "salary");
  r = await fetch(`${BASE}/api/documents`, {
    method: "POST",
    headers: { cookie: `finos_session=${cookie}` },
    body: fd,
  });
  const up = await r.json().catch(() => ({}));
  const docId = up.document?.id;
  check("文档上传成功(返回 document.id)", r.status === 200 && up.ok && !!docId, `status=${r.status}`);

  r = await fetch(`${BASE}/api/documents`, { headers: { cookie: `finos_session=${cookie}` } });
  const list = await r.json().catch(() => ({}));
  check("文档列表含刚上传项", Array.isArray(list.documents) && list.documents.some((d) => d.id === docId));

  if (docId) {
    r = await fetch(`${BASE}/api/documents/${docId}`, {
      method: "DELETE",
      headers: { cookie: `finos_session=${cookie}` },
    });
    check("文档删除成功", r.status === 200, `status=${r.status}`);
    r = await fetch(`${BASE}/api/documents`, { headers: { cookie: `finos_session=${cookie}` } });
    const list2 = await r.json().catch(() => ({}));
    check("删除后列表不含该文档", !list2.documents?.some((d) => d.id === docId));
  }

  finish();
}

function finish() {
  // 清理测试用户产生的 .data 文件，避免污染
  for (const [kind, id] of cleanup) {
    try {
      if (kind === "user") {
        const f = join(ROOT, ".data", "users", `${id}.json`);
        if (existsSync(f)) rmSync(f, { force: true });
        const fp = join(ROOT, ".data", "financial_profiles", `${id}.json`);
        if (existsSync(fp)) rmSync(fp, { force: true });
        const dir = join(ROOT, ".data", "documents", id);
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn("清理失败(可忽略):", e?.message);
    }
  }
  const failed = results.filter((x) => !x.ok);
  console.log(`\n==== 验收结果：${results.length - failed.length}/${results.length} 通过 ====`);
  if (failed.length) {
    console.log("失败项：", failed.map((f) => f.name).join("; "));
    process.exit(1);
  } else {
    console.log("全部通过 ✅");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("验收脚本异常：", e);
  finish();
});
