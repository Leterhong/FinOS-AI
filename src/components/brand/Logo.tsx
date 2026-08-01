import { cn } from "@/lib/utils";

/**
 * FinOS AI 品牌 Logo 组件。
 * - 读取 /public/logo.png（AI + Finance + Wealth Growth 设计理念）。
 * - 用于登录页、Sidebar、Loading 等品牌视觉位置。
 */
export default function Logo({
  size = 40,
  className,
  rounded = true,
}: {
  size?: number;
  className?: string;
  rounded?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="FinOS AI"
      width={size}
      height={size}
      draggable={false}
      className={cn(rounded ? "rounded-xl" : "", "object-cover", className)}
    />
  );
}
