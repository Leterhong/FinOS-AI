import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Logo from "@/components/brand/Logo";

export const metadata = {
  title: "隐私政策 · FinOS AI",
  description: "FinOS AI 隐私政策：你的财富数据如何被收集、加密、隔离与保护。",
};

const SECTIONS = [
  {
    title: "1. 我们收集的信息",
    body: "当你注册并使用 FinOS AI 时，我们会收集你主动提供的财富信息，包括收入、支出、资产、负债、投资与人生目标等，用于构建你的 Personal Financial Twin（个人财富数字孪生）。我们同时记录必要的账户信息（邮箱、加密后的密码）以保障账户安全。",
  },
  {
    title: "2. 数据存储与隔离",
    body: "FinOS AI 采用账户隔离、数据加密和安全访问控制机制保护用户数据。你的全部财富数据按用户账户进行物理隔离存储，敏感字段以 AES-256-GCM 加密保存。不同用户之间的数据互不可见，系统不会使用你的真实财富数据训练任何公开模型，也不会与第三方共享你的明细数据。加密密钥仅通过服务端环境变量配置，不会出现在前端或接口返回中。",
  },
  {
    title: "3. AI 模型与你的数据",
    body: "FinOS AI 采用 Bring Your Own Model（BYOM）架构。当你配置自己的大模型密钥后，AI 分析在你的授权范围内调用你所指定的模型。在缺少有效模型配置时，系统不会调用任何大语言模型，也不会基于你的数据生成分析。",
  },
  {
    title: "4. 你的权利与数据删除",
    body: "你有权随时查看、导出或删除自己的财富数据。你可以在账户设置中管理模型配置、撤销授权，或注销账户以清除全部关联数据。注销账户时，系统会验证你的身份，并删除你的财富信息、上传文件、长期记忆、知识切片与 AI 使用记录，之后退出登录。请注意，删除操作不可恢复。",
  },
  {
    title: "5. 联系我们",
    body: "如你对本隐私政策有任何疑问，或希望行使你的数据权利，可通过应用内反馈渠道与我们联系。我们将在合理时间内予以回应。",
  },
];

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </Link>
          <Logo size={36} />
        </div>

        <div className="glass rounded-2xl p-8 md:p-10">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
              <ShieldCheck className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                隐私政策
              </h1>
              <p className="text-xs text-white/40">FinOS AI · 最后更新 2026-07</p>
            </div>
          </div>

          <p className="mb-8 text-sm leading-relaxed text-white/60">
            我们深知财富数据的敏感性。FinOS AI 采用账户隔离、数据加密和安全访问控制机制保护用户数据。本政策说明 FinOS AI 如何收集、使用、存储与保护你的信息。使用本产品即表示你理解并同意以下条款。
          </p>

          <div className="space-y-7">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="mb-2 text-base font-semibold text-white">
                  {s.title}
                </h2>
                <p className="text-sm leading-relaxed text-white/55">{s.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-10 border-t border-white/10 pt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-6 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:shadow-glow-purple"
            >
              我已了解，去登录
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          FinOS AI · Your Personal AI CFO
        </p>
      </div>
    </div>
  );
}
