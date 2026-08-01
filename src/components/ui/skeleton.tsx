import { cn } from "@/lib/utils";

/**
 * 骨架屏基础组件（shadcn 风格，贴合项目暗色玻璃风）。
 * 复用 Tailwind 的 animate-pulse，背景使用极淡白以融入玻璃卡片。
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/5", className)}
      {...props}
    />
  );
}
