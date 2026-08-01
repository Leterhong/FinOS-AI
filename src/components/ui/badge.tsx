import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-electric/20 text-brand-electric",
        secondary: "border-transparent bg-white/10 text-white/70",
        success: "border-transparent bg-semantic-success/20 text-semantic-success",
        risk: "border-transparent bg-semantic-risk/20 text-semantic-risk",
        warn: "border-transparent bg-semantic-warn/20 text-semantic-warn",
        purple: "border-transparent bg-brand-purple/20 text-brand-purple",
        outline: "text-white/60 border-white/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
