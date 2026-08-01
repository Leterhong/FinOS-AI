"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import { useExportData, useClearMemory, useMemory } from "@/hooks/use-backend";
import type { MemoryGroup } from "@/types/personal_os";
import {
  ShieldCheck,
  Database,
  Download,
  Trash2,
  Lock,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Brain,
  KeyRound,
  ScrollText,
  EyeOff,
  UserRoundCheck,
} from "lucide-react";

const DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。";
const SECURITY_STATEMENT =
  "FinOS AI 采用账户隔离、数据加密和安全访问控制机制保护用户数据。";
const CONFIRM_PHRASE = "CLEAR MEMORY";

interface MemoryStat {
  kind: string;
  label: string;
  count: number;
}

interface ExportReceipt {
  exportedAt: string;
  count: number;
}

export default function PrivacyCenterPage() {
  const memoryQ = useMemory();
  const exportQ = useExportData();
  const clearMemory = useClearMemory();

  const [exportReceipt, setExportReceipt] = useState<ExportReceipt | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmText, setConfirmText] = useState<string>("");
  const [cleared, setCleared] = useState<boolean>(false);

  const memory = memoryQ.data as MemoryGroup | undefined;

  const stats = useMemo<MemoryStat[]>(() => {
    const groups = memory?.groups ?? {};
    const labels = memory?.labels ?? {};
    return Object.keys(groups).map((kind) => ({
      kind,
      label: labels[kind] ?? kind,
      count: groups[kind]?.length ?? 0,
    }));
  }, [memory]);

  const total = useMemo<number>(
    () => stats.reduce((sum, s) => sum + s.count, 0),
    [stats]
  );

  const hasMemory = memory?.hasData === true && stats.length > 0;

  const handleExport = async (): Promise<void> => {
    setExportError(null);
    try {
      const res = await exportQ.refetch();
      if (res.data) {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `finos-ai-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setExportReceipt({
          exportedAt: res.data.exportedAt,
          count: Object.keys(res.data.data ?? {}).length,
        });
      } else {
        setExportError("导出未返回数据，请稍后重试。");
      }
    } catch {
      setExportError("导出失败，请检查网络或稍后重试。");
    }
  };

  const handleClear = (): void => {
    clearMemory.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false);
        setConfirmText("");
        setCleared(true);
      },
    });
  };

  return (
    <PageTransition>
      <div className="space-y-7">
        {/* 页头 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
                <ShieldCheck className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">数据控制中心</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              你的财富数据与 AI 记忆完全归你所有。在这里查看 AI 当前记住了什么、
              随时导出你的全部数据副本，或清空 AI 记忆。所有操作即时生效。
            </p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-semantic-success/20 bg-semantic-success/5 px-3 py-1.5 text-[11px] text-semantic-success/90 sm:inline-flex">
            <Lock className="h-3 w-3" /> 数据由你掌控
          </span>
        </motion.div>

        {/* 区块 1：数据概览 */}
        <Block index={0}>
          <Section
            title="数据概览"
            icon={<Database className="h-4 w-4" />}
            hint="AI 当前记住的内容"
          >
            {memoryQ.isLoading ? (
              <SkeletonRows />
            ) : memoryQ.isError ? (
              <ErrorHint text="记忆数据加载失败，请稍后重试。这不影响你的财富数据安全。" />
            ) : !hasMemory ? (
              <EmptyHint text="暂无记忆数据" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-end gap-3">
                  <span className="text-4xl font-bold leading-none text-white">{total}</span>
                  <span className="pb-1 text-xs text-white/45">条记忆 · 共 {stats.length} 个类别</span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {stats.map((s) => (
                    <div
                      key={s.kind}
                      className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10 transition hover:ring-white/20"
                    >
                      <p className="text-[11px] text-white/45">{s.label}</p>
                      <p className="mt-1 text-lg font-semibold text-white">
                        {s.count}
                        <span className="ml-1 text-[11px] font-normal text-white/35">条</span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] leading-snug text-white/35">
                  这些记忆用于让 AI 在分析时理解你的偏好与处境，仅在为你本人生成分析时被调用。
                </p>
              </div>
            )}
          </Section>
        </Block>

        {/* 区块 2：数据导出 */}
        <Block index={1}>
          <Section
            title="数据导出"
            icon={<Download className="h-4 w-4" />}
            hint="JSON 格式 · 本地下载"
          >
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-white/55">
                导出你在 FinOS AI 的全部个人数据（财富档案、记忆、时间线、知识、决策记录等），格式为 JSON。
                文件在你的浏览器本地生成并下载，不经过第三方。
              </p>
              <button
                type="button"
                onClick={handleExport}
                disabled={exportQ.isFetching}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportQ.isFetching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在打包数据…
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" /> 导出我的数据
                  </>
                )}
              </button>

              {exportError && <ErrorHint text={exportError} />}

              {exportReceipt && !exportQ.isFetching && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-semantic-success/[0.06] px-3 py-2.5 ring-1 ring-semantic-success/20">
                  <CheckCircle2 className="h-3.5 w-3.5 text-semantic-success" />
                  <span className="text-[12px] text-white/75">
                    已导出，共 {exportReceipt.count} 项
                  </span>
                  <span className="text-[11px] text-white/35">
                    导出时间 {formatTime(exportReceipt.exportedAt)}
                  </span>
                </div>
              )}
            </div>
          </Section>
        </Block>

        {/* 区块 3：记忆管理（危险操作） */}
        <Block index={2}>
          <GlassCard className="border border-rose-400/25 bg-rose-500/[0.03] p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-rose-300/90">
                <Trash2 className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-white">清空 AI 记忆</h2>
            </div>

            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-white/55">
                清空后 AI 将不再记得你的偏好、人生阶段与历史决策，
                <span className="font-medium text-rose-300/90">此操作不可撤销</span>
                。财富数据本身不受影响。
              </p>

              {cleared && !confirmOpen && (
                <div className="flex items-center gap-2 rounded-xl bg-semantic-success/[0.06] px-3 py-2.5 ring-1 ring-semantic-success/20">
                  <CheckCircle2 className="h-3.5 w-3.5 text-semantic-success" />
                  <span className="text-[12px] text-white/75">AI 记忆已清空</span>
                </div>
              )}

              {clearMemory.isError && (
                <ErrorHint text="清空失败，记忆未被改动。请稍后重试。" />
              )}

              {!confirmOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmOpen(true);
                    setConfirmText("");
                    setCleared(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-400/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 清空 AI 记忆
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-3 rounded-xl border border-rose-400/20 bg-rose-500/[0.04] p-4"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300/90" />
                    <p className="text-[12px] leading-relaxed text-white/65">
                      请在下方输入{" "}
                      <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-rose-200">
                        {CONFIRM_PHRASE}
                      </code>{" "}
                      以确认清空。这是最后一步。
                    </p>
                  </div>
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={CONFIRM_PHRASE}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-rose-400/40"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={confirmText.trim() !== CONFIRM_PHRASE || clearMemory.isPending}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition",
                        "border border-rose-400/40 bg-rose-400/15 text-rose-200 hover:bg-rose-400/25",
                        "disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/30 disabled:hover:bg-white/[0.03]"
                      )}
                    >
                      {clearMemory.isPending ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在清空…
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-3.5 w-3.5" /> 确认清空
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmOpen(false);
                        setConfirmText("");
                      }}
                      disabled={clearMemory.isPending}
                      className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/55 transition hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      取消
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </GlassCard>
        </Block>

        {/* 区块 4：数据安全说明 */}
        <Block index={3}>
          <Section title="数据安全说明" icon={<Lock className="h-4 w-4" />} hint="始终生效">
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-white/70">{SECURITY_STATEMENT}</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <SecurityPoint
                  icon={<UserRoundCheck className="h-3.5 w-3.5" />}
                  title="账户级数据隔离"
                  desc="每个账户的数据在存储与查询层独立隔离，互不可见。"
                />
                <SecurityPoint
                  icon={<KeyRound className="h-3.5 w-3.5" />}
                  title="字段级加密存储"
                  desc="敏感字段落盘前完成加密，明文不进入持久化文件。"
                />
                <SecurityPoint
                  icon={<ScrollText className="h-3.5 w-3.5" />}
                  title="访问审计日志"
                  desc="关键数据的读取与变更留有可追溯的审计记录。"
                />
                <SecurityPoint
                  icon={<EyeOff className="h-3.5 w-3.5" />}
                  title="模型调用不留存原文"
                  desc="你的数据仅用于为你本人生成分析，调用后不作留存。"
                />
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
                <p className="text-[12px] leading-relaxed text-white/55">{DISCLAIMER}</p>
              </div>
            </div>
          </Section>
        </Block>

        <p className="pt-2 text-center text-[11px] text-white/30">{DISCLAIMER}</p>
      </div>
    </PageTransition>
  );
}

/* ───────────────────────── 子组件 ───────────────────────── */

function Block({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.06 * index }}
    >
      {children}
    </motion.div>
  );
}

function Section({
  title,
  icon,
  hint,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-semantic-success">{icon}</span>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {hint && <span className="text-[11px] text-white/35">{hint}</span>}
      </div>
      {children}
    </GlassCard>
  );
}

function SecurityPoint({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10 transition hover:ring-white/20">
      <span className="mt-0.5 text-semantic-success">{icon}</span>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-white/85">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-white/50">{desc}</p>
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] py-8 text-center text-sm text-white/40 ring-1 ring-white/10">
      {text}
    </div>
  );
}

function ErrorHint({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
      <p className="text-[12px] leading-relaxed text-white/60">{text}</p>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3">
      <div className="h-9 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03] ring-1 ring-white/10" />
        ))}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}
