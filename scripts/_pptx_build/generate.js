const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625 in
pres.author = "FinOS AI";
pres.title = "FinOS AI 项目介绍";

// ---- Palette ----
const BG = "0B1220";        // deep navy-black (app bg)
const CARD = "121D33";      // card surface
const CARD2 = "16233D";
const BRAND = "00D68F";     // brand green
const BRAND_DK = "00B377";
const ACCENT = "38BDF8";    // sky secondary
const TEXT = "F1F5F9";
const MUTED = "9FB0C9";
const LINE = "21314F";

const HF = "Trebuchet MS";  // header font
const BF = "Calibri";       // body font

const W = 10, H = 5.625;

function bg(slide, color) { slide.background = { color: color || BG }; }

function makeShadow() {
  return { type: "outer", color: "000000", blur: 8, offset: 3, angle: 135, opacity: 0.35 };
}

// Decorative faint circles (top-right)
function decoCircles(slide) {
  slide.addShape(pres.shapes.OVAL, { x: 8.4, y: -1.1, w: 2.6, h: 2.6, fill: { color: BRAND, transparency: 88 }, line: { type: "none" } });
  slide.addShape(pres.shapes.OVAL, { x: 9.2, y: 0.7, w: 1.5, h: 1.5, fill: { color: ACCENT, transparency: 90 }, line: { type: "none" } });
}

// kicker tag
function kicker(slide, text, x, y) {
  slide.addShape(pres.shapes.RECTANGLE, { x: x, y: y + 0.06, w: 0.16, h: 0.16, fill: { color: BRAND }, line: { type: "none" } });
  slide.addText(text, { x: x + 0.28, y: y, w: 8, h: 0.3, fontFace: HF, fontSize: 12, bold: true, color: BRAND, charSpacing: 2, margin: 0 });
}

// ---- Slide 1: Cover ----
let s = pres.addSlide();
bg(s);
decoCircles(s);
slide_kicker: {
  s.addText("OPEN-SOURCE   ·   SELF-HOSTED   ·   MIT", { x: 0.7, y: 1.15, w: 8, h: 0.35, fontFace: HF, fontSize: 13, bold: true, color: BRAND, charSpacing: 3, margin: 0 });
  s.addText("FinOS AI", { x: 0.6, y: 1.7, w: 9, h: 1.3, fontFace: "Arial Black", fontSize: 64, bold: true, color: TEXT, margin: 0 });
  s.addText("个人财富操作系统 · Personal Wealth OS", { x: 0.65, y: 3.05, w: 9, h: 0.5, fontFace: HF, fontSize: 22, bold: true, color: BRAND, margin: 0 });
  s.addText("把分散的资产、现金流与目标，汇聚成一个可对话、可推演、可主动提醒的财富数字分身。", { x: 0.65, y: 3.75, w: 8.6, h: 0.7, fontFace: BF, fontSize: 14, color: MUTED, lineSpacingMultiple: 1.15, margin: 0 });
  s.addText("v1.0.0    ·    完全开源    ·    无付费墙    ·    数据自托管", { x: 0.65, y: 4.95, w: 9, h: 0.4, fontFace: HF, fontSize: 12, bold: true, color: MUTED, charSpacing: 1, margin: 0 });
}

// ---- Slide 2: 这是什么 ----
s = pres.addSlide();
bg(s);
kicker(s, "PROJECT POSITIONING", 0.6, 0.45);
s.addText("这是什么", { x: 0.6, y: 0.78, w: 9, h: 0.7, fontFace: HF, fontSize: 34, bold: true, color: TEXT, margin: 0 });
s.addText([
  { text: "FinOS AI 是一个完全开源、可自托管的个人财富操作系统。", options: { bold: true, color: TEXT, breakLine: true, paraSpaceAfter: 10 } },
  { text: "不是记账软件——不替你记流水。", options: { bullet: { code: "2022" }, color: MUTED, breakLine: true, paraSpaceAfter: 7 } },
  { text: "不是荐股工具——不代理任何交易。", options: { bullet: { code: "2022" }, color: MUTED, breakLine: true, paraSpaceAfter: 7 } },
  { text: "而是把你的真实财务状况建成一个「财富数字分身」。", options: { bullet: { code: "2022" }, color: MUTED, breakLine: true, paraSpaceAfter: 7 } },
  { text: "可以向它提问、让它推演未来、由它主动发现问题并提醒你。", options: { bullet: { code: "2022" }, color: MUTED } },
], { x: 0.6, y: 1.7, w: 5.3, h: 3.4, fontFace: BF, fontSize: 15, lineSpacingMultiple: 1.1, valign: "top", margin: 0 });

// right stat cards
const statCards = [
  { big: "0", unit: "默认财富数据", desc: "零数据时只展示空态引导，绝不编造任何默认值" },
  { big: "100%", unit: "数据自托管", desc: "字段级 AES-256-GCM 加密，严格用户隔离" },
];
statCards.forEach((c, i) => {
  const y = 1.7 + i * 1.75;
  s.addShape(pres.shapes.RECTANGLE, { x: 6.3, y: y, w: 3.15, h: 1.55, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: 6.3, y: y, w: 0.1, h: 1.55, fill: { color: BRAND }, line: { type: "none" } });
  s.addText(c.big, { x: 6.55, y: y + 0.18, w: 2.7, h: 0.75, fontFace: "Arial Black", fontSize: 40, bold: true, color: BRAND, margin: 0 });
  s.addText(c.unit, { x: 6.55, y: y + 0.92, w: 2.7, h: 0.3, fontFace: HF, fontSize: 14, bold: true, color: TEXT, margin: 0 });
  s.addText(c.desc, { x: 6.55, y: y + 1.18, w: 2.75, h: 0.35, fontFace: BF, fontSize: 10.5, color: MUTED, margin: 0 });
});

// ---- Slide 3: 三条设计底线 ----
s = pres.addSlide();
bg(s);
kicker(s, "DESIGN PRINCIPLES", 0.6, 0.45);
s.addText("三条设计底线", { x: 0.6, y: 0.78, w: 9, h: 0.7, fontFace: HF, fontSize: 34, bold: true, color: TEXT, margin: 0 });
const principles = [
  { n: "01", t: "数据是你的", d: "全部自托管，字段级 AES-256-GCM 加密，严格用户隔离，不上传任何第三方。" },
  { n: "02", t: "模型是你的", d: "BYOM（自带模型）：在应用内填自己的 API Key。项目不内置、不代理、不转售任何模型服务。" },
  { n: "03", t: "没有付费墙", d: "无套餐、无订阅、无会员、无交易撮合。MIT 协议，功能全开。" },
];
principles.forEach((p, i) => {
  const x = 0.6 + i * 3.05;
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: 1.85, w: 2.85, h: 3.05, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: makeShadow() });
  s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: 2.2, w: 0.75, h: 0.75, fill: { color: BRAND }, line: { type: "none" } });
  s.addText(p.n, { x: x + 0.3, y: 2.2, w: 0.75, h: 0.75, fontFace: "Arial Black", fontSize: 20, bold: true, color: BG, align: "center", valign: "middle", margin: 0 });
  s.addText(p.t, { x: x + 0.3, y: 3.15, w: 2.4, h: 0.45, fontFace: HF, fontSize: 19, bold: true, color: TEXT, margin: 0 });
  s.addText(p.d, { x: x + 0.3, y: 3.65, w: 2.4, h: 1.1, fontFace: BF, fontSize: 12.5, color: MUTED, lineSpacingMultiple: 1.12, valign: "top", margin: 0 });
});

// ---- Slide 4: 核心能力总览 (2x3) ----
s = pres.addSlide();
bg(s);
kicker(s, "CORE CAPABILITIES", 0.6, 0.45);
s.addText("核心能力总览", { x: 0.6, y: 0.78, w: 9, h: 0.7, fontFace: HF, fontSize: 34, bold: true, color: TEXT, margin: 0 });
const caps = [
  { t: "财富数字分身", d: "5 步向导建模资产/负债/收支/目标" },
  { t: "六维财富评分", d: "现金流·抗风险·投资·负债·储蓄·目标" },
  { t: "情景模拟推演", d: "调节参数实时算目标达成概率" },
  { t: "AI 助手", d: "对话·多模态识别录入·报告" },
  { t: "智能体生态", d: "五大专项 AI CFO 可编排工作流" },
  { t: "智能自动化", d: "事件规则·定时·工作流·主动计划" },
];
caps.forEach((c, i) => {
  const col = i % 3, row = Math.floor(i / 3);
  const x = 0.6 + col * 3.05, y = 1.75 + row * 1.7;
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: y, w: 2.85, h: 1.5, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: y, w: 2.85, h: 0.08, fill: { color: BRAND }, line: { type: "none" } });
  s.addText(c.t, { x: x + 0.25, y: y + 0.22, w: 2.4, h: 0.4, fontFace: HF, fontSize: 16, bold: true, color: BRAND, margin: 0 });
  s.addText(c.d, { x: x + 0.25, y: y + 0.68, w: 2.45, h: 0.7, fontFace: BF, fontSize: 12, color: MUTED, lineSpacingMultiple: 1.1, valign: "top", margin: 0 });
});

// ---- Slide 5: AI 助手 & 智能体生态 ----
s = pres.addSlide();
bg(s);
kicker(s, "AI ASSISTANT & AGENTS", 0.6, 0.45);
s.addText("AI 助手 · 智能体生态", { x: 0.6, y: 0.78, w: 9, h: 0.7, fontFace: HF, fontSize: 34, bold: true, color: TEXT, margin: 0 });
function splitCard(x, head, items) {
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: 1.8, w: 4.3, h: 3.1, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: makeShadow() });
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: 1.8, w: 4.3, h: 0.08, fill: { color: ACCENT }, line: { type: "none" } });
  s.addText(head, { x: x + 0.3, y: 2.05, w: 3.7, h: 0.5, fontFace: HF, fontSize: 18, bold: true, color: TEXT, margin: 0 });
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: { code: "2022" }, color: MUTED, breakLine: true, paraSpaceAfter: 9 } })),
    { x: x + 0.3, y: 2.7, w: 3.75, h: 2.0, fontFace: BF, fontSize: 13.5, lineSpacingMultiple: 1.12, valign: "top", margin: 0 });
}
splitCard(0.6, "AI 助手", ["自然语言对话，基于你的真实数据提问", "多模态识别录入：账单/截图/文本", "识别结果须用户确认后才写入分身", "一键生成结构化财富报告"]);
splitCard(5.1, "五大专项 AI CFO", ["投资 · 现金流 · 保险 · 退休 · 税务", "每个智能体持有独立分析框架与工具集", "工具上下文锁定在调用者自身数据", "可单体运行，也可编排成多体工作流"]);

// ---- Slide 6: 自动化 & 时间线 ----
s = pres.addSlide();
bg(s);
kicker(s, "AUTOMATION & TIMELINE", 0.6, 0.45);
s.addText("智能自动化 · 财富时间线", { x: 0.6, y: 0.78, w: 9, h: 0.7, fontFace: HF, fontSize: 34, bold: true, color: TEXT, margin: 0 });
splitCard(0.6, "智能自动化", ["事件驱动规则引擎 + 定时任务", "多步工作流 + 条件 DSL + 执行计划", "行动中心：采纳/忽略反馈回流偏好画像", "行情不可用降级本地算法，预算耗尽回落本地——任何情况绝不白屏"]);
splitCard(5.1, "财富时间线", ["串联资产变动·重大决策·目标节点", "可回溯的财富全景轨迹", "向前推演 5 年、10 年净值轨迹", "过去、现在与未来一目了然"]);

// ---- Slide 7: 技术架构 ----
s = pres.addSlide();
bg(s);
kicker(s, "TECHNICAL ARCHITECTURE", 0.6, 0.45);
s.addText("技术架构", { x: 0.6, y: 0.78, w: 9, h: 0.7, fontFace: HF, fontSize: 34, bold: true, color: TEXT, margin: 0 });
const arch = [
  { t: "前端", d: "Next.js 15 App Router · React 19 · TS strict", n: "60", u: "Next 路由" },
  { t: "后端", d: "FastAPI · SQLAlchemy 2.0 · 13 路由模块", n: "44", u: "数据表" },
  { t: "部署", d: "Docker Compose 五服务 · 一键 deploy.sh", n: "5", u: "服务编排" },
  { t: "测试", d: "API + AI 质量 + 前端契约层", n: "112", u: "自动化测试" },
];
arch.forEach((a, i) => {
  const x = 0.6 + i * 2.32;
  s.addShape(pres.shapes.RECTANGLE, { x: x, y: 1.85, w: 2.12, h: 2.95, fill: { color: CARD }, line: { color: LINE, width: 1 }, shadow: makeShadow() });
  s.addText(a.t, { x: x + 0.2, y: 2.05, w: 1.8, h: 0.4, fontFace: HF, fontSize: 17, bold: true, color: BRAND, margin: 0 });
  s.addText(a.n, { x: x + 0.2, y: 2.5, w: 1.8, h: 0.8, fontFace: "Arial Black", fontSize: 36, bold: true, color: TEXT, margin: 0 });
  s.addText(a.u, { x: x + 0.2, y: 3.3, w: 1.8, h: 0.3, fontFace: HF, fontSize: 11, bold: true, color: MUTED, charSpacing: 1, margin: 0 });
  s.addText(a.d, { x: x + 0.2, y: 3.75, w: 1.85, h: 0.9, fontFace: BF, fontSize: 11, color: MUTED, lineSpacingMultiple: 1.1, valign: "top", margin: 0 });
});
s.addText("生产用 PostgreSQL，开发用 SQLite；测试可在不连任何大模型、不依赖外部服务的环境下完整运行。", { x: 0.6, y: 4.95, w: 8.8, h: 0.4, fontFace: BF, fontSize: 12, italic: true, color: MUTED, margin: 0 });

// ---- Slide 8: 安全与隐私 ----
s = pres.addSlide();
bg(s);
kicker(s, "SECURITY & PRIVACY", 0.6, 0.45);
s.addText("安全与隐私", { x: 0.6, y: 0.78, w: 9, h: 0.7, fontFace: HF, fontSize: 34, bold: true, color: TEXT, margin: 0 });
const sec = [
  "字段级 AES-256-GCM 透明加密落盘（金额/收入/模型 Key）",
  "用户隔离铁律：所有查询强制 user_id，越权统一返回 404",
  "密钥零泄露：API Key 仅掩码回显，导出不含明文",
  "JWT 双令牌：Access/Refresh 分离，Refresh 轮换与吊销",
  "纵深防护：CSRF 双提交、滑动窗口限流、上传防护、日志脱敏",
  "生产启动守卫：弱密钥或未配置时拒绝启动，而非降级",
];
s.addText(sec.map((t) => ({ text: t, options: { bullet: { code: "2022" }, color: MUTED, breakLine: true, paraSpaceAfter: 11 } })),
  { x: 0.7, y: 1.8, w: 8.7, h: 3.4, fontFace: BF, fontSize: 15, lineSpacingMultiple: 1.12, valign: "top", margin: 0 });

// ---- Slide 9: 结尾 ----
s = pres.addSlide();
bg(s);
decoCircles(s);
s.addText("你的财富，你做主", { x: 0.6, y: 1.9, w: 9, h: 1.0, fontFace: "Arial Black", fontSize: 46, bold: true, color: TEXT, align: "center", margin: 0 });
s.addText("FinOS AI —— 开源的 Personal Wealth OS", { x: 0.6, y: 3.0, w: 9, h: 0.5, fontFace: HF, fontSize: 20, bold: true, color: BRAND, align: "center", margin: 0 });
s.addText("github.com/Leterhong/FinOS-AI    ·    MIT License    ·    FinOS AI 提供信息分析与辅助决策，不构成投资建议", { x: 0.6, y: 4.5, w: 9, h: 0.4, fontFace: BF, fontSize: 12, color: MUTED, align: "center", margin: 0 });

pres.writeFile({ fileName: "F:/FinOS AI/docs/FinOS_AI_项目介绍.pptx" }).then((f) => {
  console.log("Saved:", f);
}).catch((e) => { console.error("ERR", e); process.exit(1); });
