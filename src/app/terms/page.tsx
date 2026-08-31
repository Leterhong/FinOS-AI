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
    body: "FinOS AI 是面向企业经营与风险研判的开源金融服务 Agent，提供企业资料理解、规则匹配、风险提示、投研整理和流程辅助。输出仅用于信息分析与辅助决策，不构成授信、投资、法律、审计、税务或合规意见，也不代表已完成审批、付款或对外报送。",
  },
  {
    title: "2. 账户与责任",
    body: "你应确保有权处理所创建的企业项目和上传的资料，并妥善保管部署密钥与模型凭据。不得上传非法取得的数据，不得利用模型输出绕过人工审批、监管要求或专业判断。单机体验模式不等同于已经具备组织权限与生产审计的企业系统。",
  },
  {
    title: "3. 模型与第三方服务",
    body: "当你配置自有大模型密钥（BYOM）时，相关调用由你所指定的模型服务商处理，其隐私与计费政策以该服务商为准。FinOS AI 不因第三方模型服务的可用性、准确性或费用承担责任。",
  },
  {
    title: "4. 免责声明",
    body: "资料抽取、规则匹配和模型生成可能存在遗漏、误读、时效性不足或幻觉。任何重要金额、主体、条款、规则命中和风险结论均须由有权限的人员对照原始资料复核。使用者应对基于本软件作出的决策承担责任。",
  },
  {
    title: "5. 知识产权",
    body: "项目代码按仓库所附 MIT License 提供。企业资料、模型密钥和用户生成内容的权利归其合法权利人；使用者必须自行确认输入资料、外部数据源和模型输出的授权及许可边界。FinOS AI 名称与标识的使用仍应遵守适用的商标与不误导原则。",
  },
  {
    title: "6. 协议变更与终止",
    body: "开源项目可能随版本更新本说明。你可以停止运行软件并清理工作区；若使用第三方托管、数据库、日志或模型服务，还应按相应服务条款处理数据。实际向员工或客户提供服务的部署者必须发布自己的服务协议、支持渠道和终止安排。",
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
            欢迎使用 FinOS AI。以下内容说明开源软件的能力和责任边界，不替代实际部署者应提供的企业服务协议，也不会把尚未实现的权限、审计或合规能力描述为已经可用。
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
          FinOS AI · Enterprise Financial Agent
        </p>
      </div>
    </div>
  );
}
