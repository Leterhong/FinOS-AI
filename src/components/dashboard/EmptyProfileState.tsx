"use client";

import { UserPlus, Upload, Database } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Phase 5.6 空状态 / Phase 6.7 需求十：新用户尚未创建财富档案时展示的欢迎页。
 * 对应验收项 ③「新用户登录无财富数据」与 spec 第 8 节新用户首次进入流程。
 * Phase 6.7 需求十：首次进入 Dashboard 提示「开始创建你的财富数字分身」，
 * 提供三个入口：上传资料 / 手动填写 / 导入数据。
 */
const STEPS = ["个人信息", "收入支出", "资产负债", "投资情况", "人生目标"];

export default function EmptyProfileState() {
  return (
    <EmptyState
      title="开始创建你的财富数字分身"
      subtitle="三种方式，快速完善你的真实财富数据"
      steps={STEPS}
      actions={[
        {
          label: "上传资料",
          href: "/documents",
          icon: <Upload className="h-4 w-4" />,
        },
        {
          label: "手动填写",
          href: "/onboarding/wealth",
          variant: "outline",
          icon: <UserPlus className="h-4 w-4" />,
        },
        {
          label: "导入数据",
          href: "/data",
          variant: "outline",
          icon: <Database className="h-4 w-4" />,
        },
      ]}
      note="只需 5 步，AI CFO 将根据你的真实财务与目标，为你生成专属的「数字财富分身（Financial Twin）」。"
    />
  );
}
