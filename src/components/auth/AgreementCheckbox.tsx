"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgreementCheckboxProps {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/**
 * 用户协议确认勾选框。
 * 文案含《用户服务协议》/《隐私政策》链接，点击链接仅导航不触发勾选（stopPropagation）。
 */
export default function AgreementCheckbox({
  checked,
  onChange,
}: AgreementCheckboxProps) {
  return (
    <div className="flex items-start gap-2.5 text-xs leading-relaxed text-white/50">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition",
          checked
            ? "border-transparent bg-gradient-brand text-white"
            : "border-white/20 bg-white/5 hover:border-white/30"
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <p>
        我已阅读并同意
        <Link
          href="/terms"
          target="_blank"
          onClick={(e) => e.stopPropagation()}
          className="mx-0.5 text-brand-electric hover:underline"
        >
          《用户服务协议》
        </Link>
        和
        <Link
          href="/privacy"
          target="_blank"
          onClick={(e) => e.stopPropagation()}
          className="mx-0.5 text-brand-electric hover:underline"
        >
          《隐私政策》
        </Link>
      </p>
    </div>
  );
}
