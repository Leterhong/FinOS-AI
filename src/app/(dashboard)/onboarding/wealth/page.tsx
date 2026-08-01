"use client";

/**
 * Financial Twin 创建向导（Financial Twin 6.x）。
 *
 * 9 步：欢迎 → 个人信息（含婚姻/子女/家庭）→ 收入（来源多选/稳定性）→
 * 资产（含存款/债券，实时总资产）→ 负债（含车贷/信用贷，实时净资产）→
 * 目标（类型选择，无任何预填默认值）→ 资料上传（可选）→ 连接 AI 模型（可选）→ 生成动画。
 *
 * 原则：除姓名/年龄/月收入外均可跳过；未填写 = 未设定，系统绝不伪造数据。
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import GradientText from "@/components/ui/GradientText";
import SectionHeader from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/button";
import Logo from "@/components/brand/Logo";
import { useFinancialStore } from "@/store/financial-store";
import { useAuthStore } from "@/store/auth-store";
import { useUserProfileStore } from "@/store/user-profile-store";
import { PROVIDER_PRESETS, ALL_PRESETS } from "@/ai/model-center/providers/presets";
import type { ProviderType } from "@/ai/model-center/types";
import type { DocumentMeta } from "@/documents/types";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Cpu,
  KeyRound,
  Upload,
  FileText,
  Trash2,
} from "lucide-react";

const STEPS = [
  "欢迎",
  "个人信息",
  "收入",
  "资产",
  "负债",
  "目标",
  "资料上传",
  "连接 AI 模型",
  "生成财富分身",
];

const inputCls =
  "w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none ring-1 ring-white/10 transition focus:ring-brand-electric";

const MARITAL_OPTIONS = [
  { value: "single", label: "单身" },
  { value: "married", label: "已婚" },
  { value: "divorced", label: "离异" },
  { value: "widowed", label: "丧偶" },
] as const;

const INCOME_SOURCE_OPTIONS = [
  { value: "salary", label: "工资" },
  { value: "business", label: "创业经营" },
  { value: "investment", label: "投资收益" },
  { value: "parttime", label: "兼职" },
  { value: "other", label: "其他" },
] as const;

const STABILITY_OPTIONS = [
  { value: "stable", label: "稳定" },
  { value: "medium", label: "一般" },
  { value: "volatile", label: "波动较大" },
] as const;

const GOAL_TYPE_OPTIONS = [
  { value: "retirement", label: "退休规划" },
  { value: "wealth_growth", label: "财富增长" },
  { value: "house", label: "购房" },
  { value: "education", label: "教育" },
  { value: "risk_control", label: "风险控制" },
] as const;

const DOC_CATEGORY_OPTIONS = [
  { value: "salary", label: "工资流水" },
  { value: "asset_proof", label: "资产证明" },
  { value: "investment", label: "投资记录" },
  { value: "other", label: "其他" },
] as const;

const yuan = (n: number) =>
  `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;

export default function WealthOnboardingPage() {
  const router = useRouter();
  const loadUserProfile = useFinancialStore((s) => s.loadUserProfile);
  const currentUser = useAuthStore((s) => s.currentUser);
  const profileCompleted = useAuthStore((s) => s.currentUser?.profileCompleted);
  const setWealthProfile = useUserProfileStore((s) => s.setWealthProfile);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    // Step1 个人信息
    name: "",
    age: "",
    occupation: "",
    city: "",
    maritalStatus: "",
    children: "",
    familyNote: "",
    // Step2 收入
    income: "",
    incomeSources: [] as string[],
    incomeStability: "",
    expense: "",
    investment: "",
    // Step3 资产
    cash: "",
    deposits: "",
    stocks: "",
    funds: "",
    bonds: "",
    realEstate: "",
    otherAssets: "",
    // Step4 负债
    mortgage: "",
    carLoan: "",
    creditLoan: "",
    otherLiab: "",
    // Step5 目标（无任何预填默认值）
    goalType: "",
    retirementAge: "",
    targetAmount: "",
    targetYears: "",
    lifeGoal: "",
    // Step8 模型配置（可选）
    modelProvider: "deepseek" as ProviderType,
    modelName: "",
    modelId: "",
    modelBaseUrl: "",
    modelApiKey: "",
    modelTemp: "0.7",
    modelMaxTokens: "4096",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // 资料上传状态
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [docCategory, setDocCategory] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // 已完成财富初始化的用户不应再走向导
  useEffect(() => {
    if (profileCompleted) {
      router.replace("/");
    }
  }, [profileCompleted, router]);

  // 用账户名预填姓名（真实账户数据，非伪造）
  useEffect(() => {
    if (currentUser?.name && !form.name) {
      setForm((f) => ({ ...f, name: currentUser.name }));
    }
  }, [currentUser?.name, form.name]);

  // 最后一步（生成动画）展示完成后自动跳转 Dashboard
  useEffect(() => {
    if (step === STEPS.length - 1) {
      const t = setTimeout(() => router.push("/"), 2800);
      return () => clearTimeout(t);
    }
  }, [step, router]);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const toggleSource = (v: string) =>
    setForm((f) => ({
      ...f,
      incomeSources: f.incomeSources.includes(v)
        ? f.incomeSources.filter((s) => s !== v)
        : [...f.incomeSources, v],
    }));

  const num = (v: string) => Number(v) || 0;

  // 实时计算（纯前端展示，与服务端口径一致）
  const totalAssets =
    num(form.cash) +
    num(form.deposits) +
    num(form.stocks) +
    num(form.funds) +
    num(form.bonds) +
    num(form.realEstate) +
    num(form.otherAssets);
  const totalLiabilities =
    num(form.mortgage) + num(form.carLoan) + num(form.creditLoan) + num(form.otherLiab);
  const netWorth = totalAssets - totalLiabilities;

  const stepValid = (i: number): boolean => {
    if (i === 1) {
      const age = Number(form.age);
      return !!form.age && age > 0 && age <= 120;
    }
    if (i === 2) {
      const income = Number(form.income);
      return !!form.income && income >= 0;
    }
    return true;
  };

  const modelFilled =
    form.modelId.trim() !== "" && form.modelBaseUrl.trim() !== "";

  async function createModelIfNeeded(): Promise<void> {
    if (!modelFilled) return;
    const preset = PROVIDER_PRESETS[form.modelProvider];
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerName: form.modelProvider,
        displayName: form.modelName.trim() || preset.label,
        modelName: form.modelName.trim() || form.modelId.trim(),
        modelId: form.modelId.trim(),
        baseUrl: form.modelBaseUrl.trim(),
        apiKey: form.modelApiKey.trim() || undefined,
        temperature: form.modelTemp ? Number(form.modelTemp) : undefined,
        maxTokens: form.modelMaxTokens ? Number(form.modelMaxTokens) : undefined,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "模型配置失败");
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", docCategory);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const data = (await res.json()) as { document?: DocumentMeta; error?: string };
      if (!res.ok || !data.document) throw new Error(data.error || "上传失败");
      setDocs((d) => [data.document as DocumentMeta, ...d]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDoc(id: string) {
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      setDocs((d) => d.filter((x) => x.id !== id));
    } catch {
      /* 忽略 */
    }
  }

  const handleSubmit = async (skipModel = false) => {
    if (!stepValid(1) || !stepValid(2)) {
      setError("请先完善「个人信息」与「收入」");
      setStep(1);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const body = {
        name: form.name || undefined,
        age: Number(form.age),
        occupation: form.occupation || undefined,
        city: form.city || undefined,
        maritalStatus: form.maritalStatus || undefined,
        children: form.children === "" ? undefined : Number(form.children),
        familyNote: form.familyNote || undefined,
        income: Number(form.income),
        incomeSources: form.incomeSources.length ? form.incomeSources : undefined,
        incomeStability: form.incomeStability || undefined,
        expense: num(form.expense),
        investment: num(form.investment),
        assets: {
          cash: num(form.cash),
          deposits: num(form.deposits),
          stocks: num(form.stocks),
          funds: num(form.funds),
          bonds: num(form.bonds),
          realEstate: num(form.realEstate),
          other: num(form.otherAssets),
        },
        liabilities: {
          mortgage: num(form.mortgage),
          carLoan: num(form.carLoan),
          creditLoan: num(form.creditLoan),
          loans: 0,
          other: num(form.otherLiab),
        },
        goals: {
          type: form.goalType || undefined,
          // 未填写 = 0（未设定），不伪造 55 岁 / 800 万
          retirementAge: num(form.retirementAge),
          targetAmount: num(form.targetAmount),
          targetYears: num(form.targetYears) || undefined,
          lifeGoal: form.lifeGoal,
        },
      };

      const res = await fetch("/api/profile/wealth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        userId?: string;
        wealthProfile?: import("@/financial-profile/wealth-types").WealthProfile;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "创建失败");

      // 若用户在引导中填写了模型，则一并创建（可选）。
      if (!skipModel && modelFilled) {
        try {
          await createModelIfNeeded();
        } catch (e) {
          // 模型配置失败不阻断财富画像创建；进入 Dashboard 后可再配。
          console.warn("[onboarding] 模型配置失败，已跳过：", e);
        }
      }

      if (data.userId) {
        if (data.wealthProfile) setWealthProfile(data.userId, data.wealthProfile);
        await loadUserProfile(data.userId, true);
      }
      setStep(STEPS.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
      setSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Hero + 步骤进度 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
              <Sparkles className="h-5 w-5 text-white" />
            </span>
            <span className="rounded-full bg-brand-electric/15 px-3 py-1 text-[11px] text-brand-electric">
              Financial Twin 创建向导
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            <GradientText>创建你的 AI 财富分身</GradientText>
          </h1>
          <p className="mt-2 text-sm text-white/40">
            花两分钟告诉我你的情况，我会生成专属的 Personal Financial Twin，并长期陪伴你的财富成长。
          </p>

          {/* 步骤指示 */}
          <div className="mt-6 flex items-center gap-2">
            {STEPS.map((label, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div key={label} className="flex flex-1 items-center gap-2">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      done
                        ? "bg-brand-electric text-white"
                        : active
                          ? "bg-gradient-brand text-white shadow-glow-blue"
                          : "bg-white/[0.06] text-white/40"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span
                    className={`hidden text-xs lg:block ${active ? "text-white" : "text-white/40"}`}
                  >
                    {label}
                  </span>
                  {i < STEPS.length - 1 && <div className="h-px flex-1 bg-white/10" />}
                </div>
              );
            })}
          </div>
        </motion.div>

        <div className="space-y-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Step 0：欢迎 */}
              {step === 0 && (
                <GlassCard className="flex flex-col items-center gap-6 p-10 text-center">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6 }}
                    className="overflow-hidden rounded-2xl shadow-glow-blue"
                  >
                    <Logo size={72} />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                      创建你的 AI 财富分身
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-white/50">
                      FinOS AI 将根据你的真实财务数据建立 Financial Twin，
                      <br className="hidden sm:block" />
                      模拟你的财富未来，并提供专属的 AI CFO 建议。
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { t: "真实数据", d: "按你的实际收支与资产建模" },
                      { t: "隐私隔离", d: "数据按账户加密隔离" },
                      { t: "长期陪伴", d: "随你的人生目标动态演进" },
                    ].map((c) => (
                      <div key={c.t} className="rounded-xl bg-white/[0.03] p-3 text-center">
                        <p className="text-sm font-medium text-white">{c.t}</p>
                        <p className="mt-1 text-xs text-white/40">{c.d}</p>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              )}

              {/* Step 1：个人信息 */}
              {step === 1 && (
                <GlassCard className="p-6">
                  <SectionHeader
                    eyebrow="第一步"
                    title="关于你"
                    subtitle="基本个人信息（除姓名/年龄外均可跳过）"
                  />
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="姓名 *">
                      <input
                        className={inputCls}
                        placeholder="如 张三"
                        value={form.name}
                        onChange={(e) => set("name", e.target.value)}
                      />
                    </Field>
                    <Field label="年龄 *">
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="请输入年龄"
                        value={form.age}
                        onChange={(e) => set("age", e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="职业">
                      <input
                        className={inputCls}
                        placeholder="如 工程师"
                        value={form.occupation}
                        onChange={(e) => set("occupation", e.target.value)}
                      />
                    </Field>
                    <Field label="城市">
                      <input
                        className={inputCls}
                        placeholder="如 上海"
                        value={form.city}
                        onChange={(e) => set("city", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="婚姻状态">
                      <div className="flex flex-wrap gap-2">
                        {MARITAL_OPTIONS.map((o) => (
                          <ChipButton
                            key={o.value}
                            active={form.maritalStatus === o.value}
                            onClick={() =>
                              set(
                                "maritalStatus",
                                form.maritalStatus === o.value ? "" : o.value
                              )
                            }
                          >
                            {o.label}
                          </ChipButton>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="子女数量">
                      <input
                        type="number"
                        min="0"
                        className={inputCls}
                        placeholder="0"
                        value={form.children}
                        onChange={(e) => set("children", e.target.value)}
                      />
                    </Field>
                    <Field label="家庭情况说明">
                      <input
                        className={inputCls}
                        placeholder="如 与父母同住 / 双职工家庭"
                        value={form.familyNote}
                        onChange={(e) => set("familyNote", e.target.value)}
                      />
                    </Field>
                  </div>
                </GlassCard>
              )}

              {/* Step 2：收入 */}
              {step === 2 && (
                <GlassCard className="p-6">
                  <SectionHeader
                    eyebrow="第二步"
                    title="收入情况"
                    subtitle="月度收入、来源与稳定性"
                  />
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="月收入（元）*">
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="请输入月收入"
                        value={form.income}
                        onChange={(e) => set("income", e.target.value)}
                        required
                      />
                    </Field>
                    <Field label="月支出（元）">
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="选填，不填视为未设定"
                        value={form.expense}
                        onChange={(e) => set("expense", e.target.value)}
                      />
                    </Field>
                    <Field label="每月投资金额（元）">
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="选填，不填视为未设定"
                        value={form.investment}
                        onChange={(e) => set("investment", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="收入来源（可多选）">
                      <div className="flex flex-wrap gap-2">
                        {INCOME_SOURCE_OPTIONS.map((o) => (
                          <ChipButton
                            key={o.value}
                            active={form.incomeSources.includes(o.value)}
                            onClick={() => toggleSource(o.value)}
                          >
                            {o.label}
                          </ChipButton>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="收入稳定性">
                      <div className="flex flex-wrap gap-2">
                        {STABILITY_OPTIONS.map((o) => (
                          <ChipButton
                            key={o.value}
                            active={form.incomeStability === o.value}
                            onClick={() =>
                              set(
                                "incomeStability",
                                form.incomeStability === o.value ? "" : o.value
                              )
                            }
                          >
                            {o.label}
                          </ChipButton>
                        ))}
                      </div>
                    </Field>
                  </div>
                </GlassCard>
              )}

              {/* Step 3：资产 */}
              {step === 3 && (
                <GlassCard className="p-6">
                  <SectionHeader
                    eyebrow="第三步"
                    title="你的资产"
                    subtitle="当前持有的资产明细（不填视为 0）"
                  />
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="现金（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.cash} onChange={(e) => set("cash", e.target.value)} />
                    </Field>
                    <Field label="银行存款（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.deposits} onChange={(e) => set("deposits", e.target.value)} />
                    </Field>
                    <Field label="股票（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.stocks} onChange={(e) => set("stocks", e.target.value)} />
                    </Field>
                    <Field label="基金（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.funds} onChange={(e) => set("funds", e.target.value)} />
                    </Field>
                    <Field label="债券（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.bonds} onChange={(e) => set("bonds", e.target.value)} />
                    </Field>
                    <Field label="房产（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.realEstate} onChange={(e) => set("realEstate", e.target.value)} />
                    </Field>
                    <Field label="其他资产（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.otherAssets} onChange={(e) => set("otherAssets", e.target.value)} />
                    </Field>
                  </div>
                  <div className="mt-5 flex items-center justify-between rounded-xl bg-semantic-success/[0.06] px-4 py-3 ring-1 ring-semantic-success/20">
                    <span className="text-xs text-white/50">总资产（自动计算）</span>
                    <span className="text-lg font-semibold text-semantic-success">
                      {yuan(totalAssets)}
                    </span>
                  </div>
                </GlassCard>
              )}

              {/* Step 4：负债 */}
              {step === 4 && (
                <GlassCard className="p-6">
                  <SectionHeader
                    eyebrow="第四步"
                    title="你的负债"
                    subtitle="当前未结清的负债（不填视为 0）"
                  />
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="房贷（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.mortgage} onChange={(e) => set("mortgage", e.target.value)} />
                    </Field>
                    <Field label="车贷（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.carLoan} onChange={(e) => set("carLoan", e.target.value)} />
                    </Field>
                    <Field label="信用贷（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.creditLoan} onChange={(e) => set("creditLoan", e.target.value)} />
                    </Field>
                    <Field label="其他负债（元）">
                      <input type="number" className={inputCls} placeholder="0" value={form.otherLiab} onChange={(e) => set("otherLiab", e.target.value)} />
                    </Field>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="flex flex-col rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/10">
                      <span className="text-xs text-white/50">总负债</span>
                      <span className="mt-1 text-lg font-semibold text-white">
                        {yuan(totalLiabilities)}
                      </span>
                    </div>
                    <div className="flex flex-col rounded-xl bg-semantic-success/[0.06] px-4 py-3 ring-1 ring-semantic-success/20">
                      <span className="text-xs text-white/50">净资产 = 总资产 − 总负债</span>
                      <span
                        className={`mt-1 text-lg font-semibold ${
                          netWorth >= 0 ? "text-semantic-success" : "text-red-400"
                        }`}
                      >
                        {yuan(netWorth)}
                      </span>
                    </div>
                  </div>
                </GlassCard>
              )}

              {/* Step 5：目标 */}
              {step === 5 && (
                <GlassCard className="p-6">
                  <SectionHeader
                    eyebrow="第五步"
                    title="财务目标"
                    subtitle="你希望财富为你实现什么（全部可跳过，不填即未设定）"
                  />
                  <div className="mt-4">
                    <Field label="目标类型">
                      <div className="flex flex-wrap gap-2">
                        {GOAL_TYPE_OPTIONS.map((o) => (
                          <ChipButton
                            key={o.value}
                            active={form.goalType === o.value}
                            onClick={() =>
                              set("goalType", form.goalType === o.value ? "" : o.value)
                            }
                          >
                            {o.label}
                          </ChipButton>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field label="目标退休年龄">
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="未设定"
                        value={form.retirementAge}
                        onChange={(e) => set("retirementAge", e.target.value)}
                      />
                    </Field>
                    <Field label="目标金额（元）">
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="未设定"
                        value={form.targetAmount}
                        onChange={(e) => set("targetAmount", e.target.value)}
                      />
                    </Field>
                    <Field label="期望达成时间（年）">
                      <input
                        type="number"
                        className={inputCls}
                        placeholder="未设定"
                        value={form.targetYears}
                        onChange={(e) => set("targetYears", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="人生目标描述">
                      <textarea
                        className={`${inputCls} min-h-[80px] resize-none`}
                        placeholder="如：45 岁前创办自己的公司 / 为子女储备教育金 / 10 年内实现财富自由"
                        value={form.lifeGoal}
                        onChange={(e) => set("lifeGoal", e.target.value)}
                      />
                    </Field>
                  </div>
                </GlassCard>
              )}

              {/* Step 6：资料上传（可选） */}
              {step === 6 && (
                <GlassCard className="p-6">
                  <SectionHeader
                    eyebrow="第六步"
                    title="上传财务资料"
                    subtitle="工资流水 / 资产证明 / 投资记录（可选，供 AI 后续深度分析）"
                  />
                  <div className="mt-4 space-y-4">
                    <Field label="资料分类">
                      <div className="flex flex-wrap gap-2">
                        {DOC_CATEGORY_OPTIONS.map((o) => (
                          <ChipButton
                            key={o.value}
                            active={docCategory === o.value}
                            onClick={() => setDocCategory(o.value)}
                          >
                            {o.label}
                          </ChipButton>
                        ))}
                      </div>
                    </Field>

                    <label
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-8 text-center transition hover:border-semantic-success/40 hover:bg-white/[0.04] ${
                        uploading ? "pointer-events-none opacity-60" : ""
                      }`}
                    >
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(f);
                          e.target.value = "";
                        }}
                      />
                      {uploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-semantic-success" />
                      ) : (
                        <Upload className="h-6 w-6 text-semantic-success" />
                      )}
                      <p className="text-sm text-white/70">
                        {uploading ? "正在上传…" : "点击选择文件上传"}
                      </p>
                      <p className="text-[11px] text-white/35">
                        支持 PDF / Excel / CSV / 图片，单文件不超过 10MB
                      </p>
                    </label>

                    {uploadError && (
                      <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                        {uploadError}
                      </p>
                    )}

                    {docs.length > 0 && (
                      <div className="space-y-2">
                        {docs.map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/8"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-semantic-success" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-white">{d.fileName}</p>
                              <p className="text-[11px] text-white/35">
                                {DOC_CATEGORY_OPTIONS.find((c) => c.value === d.category)
                                  ?.label ?? "其他"}{" "}
                                · {(d.size / 1024).toFixed(0)} KB
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(d.id)}
                              className="rounded-lg p-1.5 text-white/40 transition hover:bg-red-500/10 hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[11px] text-white/35">
                      此步骤可选。上传的资料仅归属你的账户，后续 AI 财务分析可引用其内容。
                    </p>
                  </div>
                </GlassCard>
              )}

              {/* Step 7：连接 AI 模型（可选） */}
              {step === 7 && (
                <GlassCard className="p-6">
                  <SectionHeader
                    eyebrow="第七步"
                    title="连接你的 AI 模型"
                    subtitle="让 AI CFO 使用你自己的大模型 API（也可稍后在「AI 模型中心」配置）"
                  />
                  <div className="mt-4 space-y-4">
                    <Field label="Provider">
                      <div className="grid grid-cols-3 gap-2">
                        {ALL_PRESETS.map((p) => (
                          <button
                            key={p.type}
                            type="button"
                            onClick={() => {
                              set("modelProvider", p.type);
                              if (!form.modelBaseUrl) set("modelBaseUrl", p.baseUrl);
                            }}
                            className={`rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                              form.modelProvider === p.type
                                ? "bg-brand-electric/20 border border-brand-electric/40 text-white"
                                : "bg-white/[0.04] border border-white/8 text-white/60 hover:text-white"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Model ID *">
                        <input
                          className={inputCls}
                          placeholder="deepseek-chat"
                          value={form.modelId}
                          onChange={(e) => set("modelId", e.target.value)}
                        />
                      </Field>
                      <Field label="API URL *">
                        <input
                          className={inputCls}
                          placeholder="https://api.deepseek.com/v1"
                          value={form.modelBaseUrl}
                          onChange={(e) => set("modelBaseUrl", e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field
                      label={
                        <span className="flex items-center gap-1">
                          <KeyRound className="h-3 w-3" /> API Key
                          {form.modelProvider !== "ollama" && <span className="text-white/30">（本地模型可留空）</span>}
                        </span>
                      }
                    >
                      <input
                        type="password"
                        className={inputCls}
                        placeholder="sk-..."
                        value={form.modelApiKey}
                        onChange={(e) => set("modelApiKey", e.target.value)}
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="温度 (0–1)">
                        <input type="number" step="0.1" min="0" max="1" className={inputCls} value={form.modelTemp} onChange={(e) => set("modelTemp", e.target.value)} />
                      </Field>
                      <Field label="Max Tokens">
                        <input type="number" step="256" min="1" className={inputCls} value={form.modelMaxTokens} onChange={(e) => set("modelMaxTokens", e.target.value)} />
                      </Field>
                    </div>
                    <p className="-mt-1 flex items-center gap-1.5 text-[11px] text-white/35">
                      <Cpu className="h-3 w-3" /> 此步骤可选。填写后 AI CFO 将使用你自己的模型；留空则进入 Dashboard 后再配置。
                    </p>
                  </div>
                </GlassCard>
              )}

              {/* Step 8：生成 Financial Twin（动画） */}
              {step === 8 && (
                <GlassCard className="flex flex-col items-center gap-7 p-12 text-center">
                  <div className="relative flex h-28 w-28 items-center justify-center">
                    <motion.div
                      className="absolute inset-0 rounded-full border-2 border-brand-electric/30"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      style={{ borderTopColor: "rgba(14,165,233,0.9)" }}
                    />
                    <motion.div
                      className="absolute inset-2 rounded-full border-2 border-semantic-success/30"
                      animate={{ rotate: -360 }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                      style={{ borderBottomColor: "rgba(0,214,143,0.9)" }}
                    />
                    <motion.div
                      initial={{ scale: 0.85, opacity: 0.7 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 1.2, repeat: Infinity, repeatType: "reverse" }}
                      className="overflow-hidden rounded-2xl shadow-glow-blue"
                    >
                      <Logo size={64} />
                    </motion.div>
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white">
                      正在创建你的 Financial Twin
                    </h2>
                    <p className="mt-2 text-sm text-white/50">
                      正在分析你的财富状态，生成专属的数字财富分身…
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-white/40">
                    {["财富画像", "资产配置", "目标拆解", "Twin 生成"].map((label, i) => (
                      <span key={label} className="flex items-center gap-2">
                        <motion.span
                          className="h-1.5 w-1.5 rounded-full bg-brand-electric"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.35 }}
                        />
                        {label}
                      </span>
                    ))}
                  </div>
                </GlassCard>
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</p>
          )}

          {/* 导航按钮（最后一步动画期间隐藏） */}
          {step < STEPS.length - 1 && (
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                上一步
              </Button>

              {step < STEPS.length - 2 ? (
                <Button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!stepValid(step)}
                >
                  下一步
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleSubmit(true)}
                    disabled={submitting}
                  >
                    跳过，稍后配置
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={submitting}
                    className="min-w-[200px]"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> 正在生成财富分身…
                      </>
                    ) : (
                      <>
                        完成并创建财富分身
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-white/50">{label}</span>
      {children}
    </label>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3.5 py-2 text-xs font-medium transition-all ${
        active
          ? "border border-semantic-success/40 bg-semantic-success/15 text-semantic-success"
          : "border border-white/8 bg-white/[0.04] text-white/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
