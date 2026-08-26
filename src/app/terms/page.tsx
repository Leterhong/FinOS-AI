import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import Logo from "@/components/brand/Logo";

export const metadata = {
  title: "用户服务协议 · FinOS AI",
  description: "FinOS AI 用户服务协议：产品服务范围、账户责任、免责声明与终止条款。",
};

const SECTIONS = [
  {
    title: "1. 服务说明",
    body: "FinOS AI 为你提供个人财富数字孪生（Financial Twin）、多智能体 AI 分析与财富驾驶舱等能力，帮助你理解并规划个人财富。本服务提供的所有分析、预测与建议均基于你输入的数据与所配置的模型，仅供参考，不构成任何投资、法律或税务建议。",
  },
  {
    title: "2. 账户与责任",
    body: "你需对账户下的所有活动负责，并妥善保管登录凭据与模型密钥。你承诺所填写的财富信息真实、合法，且你对数据享有合法权利。请勿使用本服务从事任何违法或侵犯他人权益的行为。",
  },
  {
    title: "3. 模型与第三方服务",
    body: "当你配置自有大模型密钥（BYOM）时，相关调用由你所指定的模型服务商处理，其隐私与计费政策以该服务商为准。FinOS AI 不因第三方模型服务的可用性、准确性或费用承担责任。",
  },
  {
    title: "4. 免责声明",
    body: "财富预测与 AI 建议存在不确定性，市场波动、个人状况变化等因素可能导致实际结果与预测不一致。你据此作出的任何决策风险自负。FinOS AI 不对因使用本服务产生的直接或间接损失承担责任。",
  },
  {
    title: "5. 知识产权",
    body: "FinOS AI 的软件、界面、品牌与内容归运营方所有。你在使用本服务过程中生成的数据归你所有，平台仅在为你提供服务所必需的范围内进行处理。",
  },
  {
    title: "6. 协议变更与终止",
    body: "我们可能根据产品与法规变化更新本协议，更新后将通过应用内提示告知。你可随时停止使用并注销账户。若你违反本协议，我们有权暂停或终止对你的服务。",
  },
];

export default function TermsPage() {
  return (
    <div className="relative min-h-screen px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回体验
          </Link>
          <Logo size={36} />
        </div>

        <div className="glass rounded-2xl p-8 md:p-10">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
              <FileText className="h-5 w-5 text-white" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                用户服务协议
              </h1>
              <p className="text-xs text-white/40">FinOS AI · 最后更新 2026-07</p>
            </div>
          </div>

          <p className="mb-8 text-sm leading-relaxed text-white/60">
            欢迎使用 FinOS AI。在使用本产品前，请仔细阅读以下条款。勾选同意即表示你已阅读、理解并接受本协议的全部内容。
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
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-6 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:shadow-glow-purple"
            >
              我已了解，进入 FinOS AI
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
