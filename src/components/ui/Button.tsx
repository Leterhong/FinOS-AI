"use client";

/**
 * FinOS UI 基础组件：Button。
 *
 * 统一高度 / 内边距 / 边框 / hover / focus-visible / disabled / loading；
 * 语义色全部来自 --finos-* 令牌，组件内不写十六进制色值。
 */
import { forwardRef } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** 传入时渲染为 Link（真实跳转而非装饰按钮）。 */
  href?: string;
}

const variantClasses: Record<Variant, string> = {
  primary: "bg-wealth text-[#041018] hover:bg-wealth-dark font-semibold",
  secondary: "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]",
  ghost: "text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]",
  danger: "border border-rose-400/20 bg-rose-400/[0.06] text-rose-200 hover:bg-rose-400/[0.12]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[11px] gap-1.5 rounded-lg",
  md: "h-9 px-4 text-xs gap-2 rounded-lg",
};

const base =
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-wealth/60 disabled:cursor-not-allowed disabled:opacity-40";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, href, className, children, disabled, ...rest },
  ref
) {
  const classes = cn(base, variantClasses[variant], sizeClasses[size], className);
  const content = (
    <>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cn(classes, "disabled:opacity-40")} aria-disabled={disabled}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
});
