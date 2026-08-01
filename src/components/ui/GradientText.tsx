import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function GradientText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-gradient-brand", className)}>{children}</span>
  );
}
