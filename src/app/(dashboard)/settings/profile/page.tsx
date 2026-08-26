"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Cpu, Database, RefreshCw, Trash2, ShieldCheck, CheckCircle2 } from "lucide-react";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import GradientText from "@/components/ui/GradientText";
import AvatarUploader from "@/components/auth/AvatarUploader";
import { useAuthStore } from "@/store/auth-store";
import { useFinancialStore } from "@/store/financial-store";
import { useModelStore } from "@/store/model-store";
import { timeAgo } from "@/lib/time";

const RISK_LABEL: Record<string, string> = {
  conservative: "保守",
  moderate: "稳健",
  aggressive: "进取",
};

const yuan = (n: number) =>
  `¥${Math.round(n || 0).toLocaleString("zh-CN")}`;

type ConfirmKey = "clear" | "rebuild" | "delete" | null;

export default function ProfileSettingsPage() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.currentUser);
  const status = useAuthStore((s) => s.status);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const profileStatus = useFinancialStore((s) => s.profileStatus);
  const profile = useFinancialStore((s) => s.profile);
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const lastSyncedAt = useFinancialStore((s) => s.lastSyncedAt);
  const clearProfileData = useFinancialStore((s) => s.clearProfileData);
  const loadUserProfile = useFinancialStore((s) => s.loadUserProfile);

  const models = useModelStore((s) => s.models);
  const active = useModelStore((s) => s.active);
  const loadModels = useModelStore((s) => s.loadModels);
  const loadActive = useModelStore((s) => s.loadActive);

  const [confirming, setConfirming] = useState<ConfirmKey>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (currentUserId) {
      loadModels(currentUserId);
      loadActive(currentUserId);
    }
  }, [currentUserId, loadModels, loadActive]);

  if (status !== "authed" || !currentUser) {
    return (
      <PageTransition>
        <div className="py-20 text-center text-white/50">加载中…</div>
      </PageTransition>
    );
  }

  const joined = currentUser.createdAt
    ? new Date(currentUser.createdAt).toLocaleDateString("zh-CN")
    : "—";
  const isGuest = currentUser.email.endsWith("@guest.finos.local");

  const netWorth =
    profile && profileStatus === "loaded"
      ? profile.cashSavings +
        profile.stockPortfolio +
        profile.realEstate +
        profile.bonds +
        profile.crypto +
        (profile.funds ?? 0) +
        (profile.house ?? 0) +
        (profile.insurance ?? 0) -
        profile.liabilities
      : 0;

  const handleClear = async () => {
    setBusy(true);
    setMsg(null);
    await clearProfileData();
    setBusy(false);
    setConfirming(null);
    setMsg({ ok: true, text: "财富数据已清除，可重新创建财富画像。" });
  };

  const handleRebuild = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await loadUserProfile(currentUserId, true);
      setMsg({ ok: true, text: "Financial Twin 已重新生成。" });
    } catch {
      setMsg({ ok: false, text: "重建失败，请重试。" });
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setMsg(null);
    const res = await deleteAccount(password);
    setBusy(false);
    setConfirming(null);
    setPassword("");
    if (res.ok) {
      router.replace("/login");
      return;
    }
    setMsg({ ok: false, text: res.error ?? "删除失败" });
  };

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <GradientText>个人资料</GradientText>
          </h1>
          <p className="mt-1 text-sm text-white/40">
            管理你的头像、财富信息与 AI 模型，所有数据按当前账户隔离存储。
          </p>
        </div>

        {msg && (
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
              msg.ok
                ? "bg-semantic-success/10 text-semantic-success"
                : "bg-red-500/10 text-red-300"
            }`}
          >
            {msg.ok ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {msg.text}
          </div>
        )}

        {/* 头像卡片 */}
        <GlassCard className="p-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
            <AvatarUploader size={112} />
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-semibold text-white">
                {currentUser.name || currentUser.email.split("@")[0]}
              </h2>
              <p className="mt-1 text-sm text-white/50">{currentUser.email}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-white/50">
                  {isGuest ? "本地体验空间" : `注册于 ${joined}`}
                </span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* 账户信息 */}
        <GlassCard className="p-6">
          <h3 className="mb-4 text-sm font-medium text-white/70">账户信息</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <dt className="text-white/40">用户 ID</dt>
              <dd className="font-mono text-xs text-white/60">{currentUser.id}</dd>
            </div>
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <dt className="text-white/40">邮箱</dt>
              <dd className="text-white/80">{currentUser.email}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-white/40">最近数据更新</dt>
              <dd className="text-white/80">
                {lastSyncedAt ? timeAgo(lastSyncedAt) : "—"}
              </dd>
            </div>
          </dl>
        </GlassCard>

        {/* 财富信息 */}
        <GlassCard className="p-6">
          <h3 className="mb-4 text-sm font-medium text-white/70">财富信息</h3>
          {profileStatus === "loaded" && profile ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Info label="净资产" value={yuan(netWorth)} highlight />
              <Info label="月收入" value={yuan(profile.monthlySalary)} />
              <Info label="总资产" value={yuan(profile.cashSavings + profile.stockPortfolio + profile.realEstate + profile.bonds + profile.crypto + (profile.funds ?? 0) + (profile.house ?? 0) + (profile.insurance ?? 0))} />
              <Info label="总负债" value={yuan(profile.liabilities)} />
              <Info label="风险偏好" value={RISK_LABEL[profile.riskLevel] ?? profile.riskLevel} />
              <Info label="目标退休年龄" value={`${profile.goal.retirementAge} 岁`} />
            </dl>
          ) : (
            <div className="rounded-xl bg-white/[0.03] p-5 text-center">
              <p className="text-sm text-white/50">尚未创建财富画像</p>
              <Link
                href="/onboarding"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-brand px-4 py-2 text-sm font-medium text-white shadow-glow-blue transition hover:scale-[1.02]"
              >
                开始创建财富画像
              </Link>
            </div>
          )}
        </GlassCard>

        {/* AI 模型配置 */}
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/70">AI 模型配置</h3>
            <Link
              href="/settings/models"
              className="text-xs text-brand-electric hover:underline"
            >
              前往模型中心
            </Link>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-blue">
              <Cpu className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              {active ? (
                <>
                  <p className="text-sm font-medium text-white">
                    {active.displayName || active.modelName || active.providerType}
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-semantic-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-semantic-success" />
                      AI CFO 已激活
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    已配置 {models.length} 个模型 · 当前默认模型生效中
                  </p>
                </>
              ) : (
                <p className="text-sm text-white/50">
                  尚未配置 AI 模型。连接模型后 AI CFO 才能生成财富建议。
                </p>
              )}
            </div>
          </div>
        </GlassCard>

        {/* 数据安全 */}
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
            <h3 className="text-sm font-medium text-white/70">数据安全</h3>
          </div>
          <div className="flex items-start gap-3 rounded-xl bg-emerald-400/[0.06] p-4 ring-1 ring-emerald-400/15">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <p className="text-xs leading-relaxed text-white/50">
              你的全部财富数据按账户物理隔离存储，并以{" "}
              <b className="text-white/70">AES-256-GCM</b>{" "}
              加密后落盘，仅本人可访问，系统不会使用你的真实财富数据训练任何公开模型。
            </p>
          </div>
        </GlassCard>

        {/* 数据管理 */}
        <GlassCard className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-white/50" />
            <h3 className="text-sm font-medium text-white/70">数据管理</h3>
          </div>

          <div className="space-y-3">
            {/* 清除财富数据 */}
            <ActionRow
              icon={<Trash2 className="h-4 w-4" />}
              title="清除财富数据"
              desc="删除你的财富画像，回到空状态（需重新创建）。不可恢复。"
              disabled={busy}
              confirming={confirming === "clear"}
              onConfirm={() => setConfirming("clear")}
              onCancel={() => setConfirming(null)}
              onExecute={handleClear}
            />

            {/* 重建 Financial Twin */}
            <ActionRow
              icon={<RefreshCw className="h-4 w-4" />}
              title="重新建立 Financial Twin"
              desc="根据你的当前财富画像，重新生成数字财富分身与分析。"
              disabled={busy || profileStatus !== "loaded"}
              confirming={confirming === "rebuild"}
              onConfirm={() => setConfirming("rebuild")}
              onCancel={() => setConfirming(null)}
              onExecute={handleRebuild}
            />

            {!isGuest && (
              <ActionRow
                icon={<ShieldCheck className="h-4 w-4" />}
                title="删除账户"
                desc="永久删除你的账户与所有财富数据，并退出当前空间。此操作不可恢复。"
                danger
                disabled={busy}
                confirming={confirming === "delete"}
                onConfirm={() => setConfirming("delete")}
                onCancel={() => setConfirming(null)}
                onExecute={handleDelete}
                prompt={
                  confirming === "delete" ? (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入账户密码确认删除"
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none focus:border-red-400/50"
                    />
                  ) : undefined
                }
              />
            )}
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
}

function Info({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
      <dt className="text-[11px] text-white/40">{label}</dt>
      <dd
        className={`mt-1 text-base font-semibold ${
          highlight ? "text-brand-electric" : "text-white"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ActionRow({
  icon,
  title,
  desc,
  danger,
  disabled,
  confirming,
  onConfirm,
  onCancel,
  onExecute,
  prompt,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  danger?: boolean;
  disabled?: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onExecute: () => void;
  prompt?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            danger
              ? "bg-red-500/15 text-red-400"
              : "bg-white/[0.06] text-white/70"
          }`}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="mt-0.5 text-xs text-white/40">{desc}</p>
          {prompt}
        </div>
      </div>

      <div className="shrink-0">
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/[0.06]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onExecute}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${
                danger
                  ? "bg-red-500/80 hover:bg-red-500"
                  : "bg-gradient-brand shadow-glow-blue"
              }`}
            >
              确认
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              danger
                ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                : "bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
            }`}
          >
            {danger ? "删除账户" : "管理"}
          </button>
        )}
      </div>
    </div>
  );
}
