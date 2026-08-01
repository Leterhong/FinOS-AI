import { cn } from "@/lib/utils";
import GradientText from "./GradientText";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
  gradient?: boolean;
}

export default function SectionHeader({
  eyebrow,
  title,
  subtitle,
  className,
  gradient = false,
}: SectionHeaderProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {eyebrow && (
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-brand-electric/70">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-semibold tracking-tight">
        {gradient ? <GradientText>{title}</GradientText> : title}
      </h2>
      {subtitle && <p className="text-sm text-white/40">{subtitle}</p>}
    </div>
  );
}
