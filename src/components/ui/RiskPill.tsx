import { cn } from "@/lib/utils";
import { Badge } from "./badge";

interface RiskPillProps {
  score: number;
  className?: string;
  showValue?: boolean;
}

export default function RiskPill({ score, className, showValue = true }: RiskPillProps) {
  const variant =
    score < 30 ? "success" : score < 60 ? "warn" : "risk";
  const label =
    score < 30 ? "低" : score < 60 ? "中" : "高";

  return (
    <Badge variant={variant} className={cn("text-[11px]", className)}>
      {showValue ? `${score} · ${label}` : label}
    </Badge>
  );
}
