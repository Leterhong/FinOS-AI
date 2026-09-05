"use client";

/**
 * Error State System（2.2 第三十八节）：按错误类型分类呈现。
 *
 * 五类：Connection / Model / Permission / Validation / Processing。
 * 每类给出可操作建议（Retry / 查看详情 / 返回），标题与提示语来自
 * classifyError 的关键词归类——调用方只需传入原始 message。
 */
import { AlertTriangle, KeyRound, Network, ShieldAlert, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export type ErrorKind = "connection" | "model" | "permission" | "validation" | "processing";

export interface ClassifiedError {
  kind: ErrorKind;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** 按错误文案关键词归类；未命中时归入 Processing（兜底）。 */
export function classifyError(message: string): ClassifiedError {
  const text = message.toLowerCase();
  if (/模型|未配置|大模型|provider|api key|密钥解密/.test(text)) {
    return {
      kind: "model",
      title: "模型连接问题",
      hint: "请到 AI 模型中心检查模型配置、密钥与连接测试结果。",
      icon: KeyRound,
    };
  }
  if (/权限|无权|登录|会话|401|403/.test(text)) {
    return {
      kind: "permission",
      title: "权限不足",
      hint: "当前工作区身份无权执行此操作，请确认登录状态或联系管理员。",
      icon: ShieldAlert,
    };
  }
  if (/超时|网络|连接失败|failed to fetch|network|econn/.test(text)) {
    return {
      kind: "connection",
      title: "网络连接异常",
      hint: "无法连接服务端或模型接口，请检查网络后重试。",
      icon: Network,
    };
  }
  if (/不合法|无效|参数|格式|validation|超过|上限/.test(text)) {
    return {
      kind: "validation",
      title: "输入或参数不合法",
      hint: "请检查填写内容（文件大小、格式、字段取值）后重新提交。",
      icon: AlertTriangle,
    };
  }
  return {
    kind: "processing",
    title: "处理未完成",
    hint: "操作在执行过程中失败，可重试；若反复失败请查看详情定位原因。",
    icon: Wrench,
  };
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "重试",
  onDetails,
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDetails?: () => void;
  className?: string;
}) {
  const info = classifyError(message);
  const Icon = info.icon;
  return (
    <div role="alert" className={cn("rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-5", className)}>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-rose-400/20 bg-rose-400/[0.08]">
          <Icon className="h-4 w-4 text-rose-300" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-rose-100">{info.title}</p>
          <p className="mt-0.5 line-clamp-2 break-all text-[11px] leading-5 text-rose-200/70">{message}</p>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">{info.hint}</p>
      {(onRetry || onDetails) && (
        <div className="mt-3 flex gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/[0.08]"
            >
              {retryLabel}
            </button>
          )}
          {onDetails && (
            <button
              type="button"
              onClick={onDetails}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-slate-400 transition hover:text-slate-200"
            >
              查看详情
            </button>
          )}
        </div>
      )}
    </div>
  );
}
