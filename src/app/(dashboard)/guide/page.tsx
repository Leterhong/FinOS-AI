"use client";

import { useState } from "react";
import {
  Bot, BriefcaseBusiness, ChevronDown, Files, MessageSquareText, Scale,
  ShieldAlert, Workflow, BookOpenCheck, Cpu, ShieldCheck, Users,
  Keyboard, CloudUpload, Database, HelpCircle,
} from "lucide-react";
import { PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: Cpu, color: "text-wealth",
    title: "第 1 步 · 接入 AI 模型",
    body: "到「AI 模型中心」添加你自己的大模型（支持 DeepSeek、OpenAI、通义千问、Ollama 等）。填入 Base URL 和 API Key，点击测试连接，通过后保存。没有模型时 AI 功能不可用，但项目管理和规则录入不受影响。",
    link: "/models", linkLabel: "前往模型中心",
  },
  {
    icon: BriefcaseBusiness, color: "text-cyan-300",
    title: "第 2 步 · 创建企业项目",
    body: "到「项目中心」新建一个企业研判项目（如融资尽调、经营分析）。项目是所有资料、风险、规则和 AI 分析的容器。",
    link: "/cases", linkLabel: "前往项目中心",
  },
  {
    icon: Files, color: "text-cyan-300",
    title: "第 3 步 · 上传资料并触发 AI 研判",
    body: "进入项目工作台 → 资料研判 → 上传文件。系统自动执行四阶段管线：解析文件 → 抽取事实 → 规则引擎判定 → 生成叙述。完成后可查看结构化事实（逐条带原文引用）、规则命中结果和 AI 分析全文。点击「定位原文」可跳转到引用位置。",
    link: "/documents", linkLabel: "前往资料研判",
  },
  {
    icon: Scale, color: "text-cyan-300",
    title: "第 4 步 · 录入业务规则",
    body: "到「规则库」创建业务规则。填写指标名称和阈值（如 货币资金 < 2,000,000 元），后续上传的资料会自动由规则引擎判定是否命中。点击规则行可展开 Visual View 决策链。",
    link: "/rules", linkLabel: "前往规则库",
  },
  {
    icon: ShieldAlert, color: "text-amber-300",
    title: "第 5 步 · 管理风险",
    body: "在「风险中心」查看候选风险。每条风险必须经过人工核验才能确认为正式风险。已确认的风险可登记缓释措施。点击风险标题可打开结构化详情（What/Severity/Evidence/Rule/Impact/Review/Traceability）。",
    link: "/risk", linkLabel: "前往风险中心",
  },
  {
    icon: MessageSquareText, color: "text-intel",
    title: "第 6 步 · 使用 AI 智能助手",
    body: "选择企业项目后向 AI 提问。AI 只基于当前项目的资料、规则和风险上下文回答，数据不足时会明确说明。回复采用流式输出。",
    link: "/assistant", linkLabel: "前往智能助手",
  },
  {
    icon: Workflow, color: "text-cyan-300",
    title: "第 7 步 · 管理流程任务",
    body: "在「流程中心」创建和推进任务：待处理 → 处理中 → 待复核 → 已完成。顶部显示研判流程全景（资料→分析→规则→风险→复核→交付）。",
    link: "/workflows", linkLabel: "前往流程中心",
  },
  {
    icon: ShieldCheck, color: "text-slate-300",
    title: "第 8 步 · 企业治理（多角色）",
    body: "到「企业治理」邀请团队成员、分配角色权限、设置数据密级、审批关键输出、查看审计记录。支持 Owner/Admin/Analyst/Reviewer/Viewer 五级角色。",
    link: "/governance", linkLabel: "前往企业治理",
  },
];

const FAQS = [
  {
    q: "为什么 AI 分析按钮是灰色的？",
    a: "需要先到 AI 模型中心配置并测试通过一个模型。",
  },
  {
    q: "上传 PDF 后提示\"未能提取可分析文本\"？",
    a: "扫描版 PDF 没有文本层，请先完成 OCR 或转为图片上传（系统支持图片 OCR）。",
  },
  {
    q: "数据存在哪里？会不会丢？",
    a: "数据首先保存在浏览器本地（刷新不丢失）。如果后端在运行，数据会自动同步到服务端并可在新设备恢复。侧栏底部显示当前同步状态。",
  },
  {
    q: "AI 分析出的结论可以直接用吗？",
    a: "不可以。所有 AI 输出都需要人工复核。系统设计原则是 Evidence First + Human in the Loop——AI 帮你理解资料，最终决策由人做出。",
  },
  {
    q: "规则命中了但我觉得不应该命中？",
    a: "规则命中由确定性引擎计算（非 LLM），点击规则的\"运行测试样本\"可以验证逻辑。条件有误直接编辑即可。",
  },
  {
    q: "侧栏底部显示\"仅本地模式\"？",
    a: "表示 FastAPI 后端不可达，数据只保存在当前浏览器。启动后端后刷新即可恢复服务端同步。",
  },
];

const SHORTCUTS = [
  { keys: "⌘K / Ctrl+K", desc: "打开全局命令面板（搜索项目、资料、风险、页面）" },
  { keys: "Esc", desc: "关闭命令面板 / 对话框 / 抽屉" },
  { keys: "Enter", desc: "发送消息（助手中 Shift+Enter 换行）" },
];

export default function GuidePage() {
  const [openStep, setOpenStep] = useState<number | null>(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return <div className="page-shell">
    <PageIntro
      eyebrow="User guide"
      title="使用指引"
      description={'按照以下 8 个步骤，完成一次从「上传资料」到「输出风险清单」的完整企业金融研判。所有步骤可反复执行，系统不会预置任何示例数据。'}
    />

    {/* 快速启动流程 */}
    <div className="space-y-2">
      {STEPS.map((step, index) => (
        <Panel key={step.title} className="overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenStep(openStep === index ? null : index)}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02]"
          >
            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04]")}>
              <step.icon className={cn("h-4 w-4", step.color)} />
            </span>
            <span className="min-w-0 flex-1 text-sm font-semibold text-slate-100">{step.title}</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-600 transition-transform", openStep === index && "rotate-180")} />
          </button>
          {openStep === index && (
            <div className="border-t border-white/[0.05] px-5 pb-4 pt-1">
              <p className="text-xs leading-6 text-slate-400">{step.body}</p>
              <a href={step.link} className="mt-2 inline-block rounded-lg border border-cyan-400/20 px-3 py-1.5 text-[10px] text-cyan-200 transition hover:bg-cyan-400/[0.08]">
                {step.linkLabel} →
              </a>
            </div>
          )}
        </Panel>
      ))}
    </div>

    {/* 快捷键 */}
    <Panel>
      <PanelHeader eyebrow="Keyboard" title="快捷键" />
      <div className="divide-y divide-white/[0.05]">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center gap-4 px-5 py-3">
            <kbd className="rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-cyan-200">{s.keys}</kbd>
            <span className="text-xs text-slate-400">{s.desc}</span>
          </div>
        ))}
      </div>
    </Panel>

    {/* 数据存储 */}
    <Panel>
      <PanelHeader eyebrow="Data storage" title="数据存储说明" />
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] p-4">
          <Database className="h-4 w-4 text-cyan-300" />
          <p className="mt-2 text-xs font-medium text-slate-200">本地即时持久化</p>
          <p className="mt-1 text-[10px] leading-5 text-slate-600">数据首先保存在浏览器 localStorage，刷新不丢失。</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] p-4">
          <CloudUpload className="h-4 w-4 text-wealth" />
          <p className="mt-2 text-xs font-medium text-slate-200">服务端自动同步</p>
          <p className="mt-1 text-[10px] leading-5 text-slate-600">后端运行时自动同步，跨设备可恢复。侧栏底部显示同步状态。</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] p-4">
          <Users className="h-4 w-4 text-slate-400" />
          <p className="mt-2 text-xs font-medium text-slate-200">多角色协作</p>
          <p className="mt-1 text-[10px] leading-5 text-slate-600">在治理中心邀请成员、分配权限，按最小权限原则控制项目访问。</p>
        </div>
      </div>
    </Panel>

    {/* 常见问题 */}
    <Panel>
      <PanelHeader eyebrow="FAQ" title="常见问题" />
      <div className="divide-y divide-white/[0.05]">
        {FAQS.map((faq, index) => (
          <div key={index}>
            <button
              type="button"
              onClick={() => setOpenFaq(openFaq === index ? null : index)}
              className="flex w-full items-center gap-2 px-5 py-3 text-left transition hover:bg-white/[0.02]"
            >
              <HelpCircle className="h-3.5 w-3.5 shrink-0 text-cyan-300/60" />
              <span className="min-w-0 flex-1 text-xs font-medium text-slate-300">{faq.q}</span>
              <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-slate-600 transition-transform", openFaq === index && "rotate-180")} />
            </button>
            {openFaq === index && (
              <p className="px-5 pb-3 pl-10 text-xs leading-6 text-slate-500">{faq.a}</p>
            )}
          </div>
        ))}
      </div>
    </Panel>

    {/* 核心价值链 */}
    <Panel>
      <PanelHeader eyebrow="Core value chain" title="核心价值链" description="整个产品围绕这条链路构建，每一步都可以追溯。" />
      <div className="flex flex-wrap items-center gap-1.5 p-5 text-[10px] font-medium text-slate-400">
        {["项目", "资料", "事实", "证据", "规则", "风险", "AI 分析", "人工复核", "决策"].map((item, i) => (
          <span key={item} className="flex items-center gap-1.5">
            <span className={cn("rounded-lg border px-2.5 py-1", i === 3 ? "border-wealth/30 bg-wealth/10 text-wealth" : i === 6 ? "border-intel/25 bg-intel/10 text-intel" : "border-white/[0.08] bg-white/[0.03]")}>{item}</span>
            {i < 8 && <span className="text-slate-700">→</span>}
          </span>
        ))}
      </div>
    </Panel>
  </div>;
}
