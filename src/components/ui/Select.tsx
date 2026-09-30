"use client";

/**
 * 平台统一下拉选择组件。
 *
 * 外观与 `.field-control` 输入框一致，弹出层使用平台深色令牌（elevated / white-alpha），
 * 不再依赖原生 <select> 弹出层（原生弹出层在不同浏览器/系统下样式不可控、与平台不搭）。
 *
 * 实现要点：保留一个 sr-only 的原生 <select> 承载 name / required / 表单语义，
 * 可见控件只是它的外观与交互代理，因此 FormData 与原生必填校验行为完全不变。
 */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  name?: string;
  options: SelectOption[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function Select({
  name,
  options,
  defaultValue = "",
  value,
  onChange,
  placeholder = "请选择",
  disabled = false,
  required = false,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const controlled = value !== undefined;
  const [current, setCurrent] = useState(controlled ? value! : defaultValue);
  const nativeId = useId();

  useEffect(() => {
    if (controlled) setCurrent(value!);
  }, [controlled, value]);

  const selected = options.find((option) => option.value === current);
  const choose = (next: string) => {
    setCurrent(next);
    onChange?.(next);
  };

  return (
    <div className={cn("relative", className)}>
      <select
        id={nativeId}
        name={name}
        value={current}
        onChange={(event) => choose(event.target.value)}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        tabIndex={-1}
        className="sr-only"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={disabled}>
          <button
            type="button"
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            className={cn(
              "field-control flex items-center justify-between gap-2 text-left",
              disabled && "cursor-not-allowed opacity-50"
            )}
          >
            <span className={cn("truncate", selected ? "text-white" : "text-white/40")}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="z-[130] max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-white/10 bg-elevated p-1 shadow-[0_20px_60px_rgba(0,0,0,.45)] backdrop-blur-xl"
          >
            {options.map((option) => {
              const active = option.value === current;
              return (
                <DropdownMenu.Item
                  key={option.value}
                  disabled={option.disabled}
                  onSelect={() => choose(option.value)}
                  className={cn(
                    "flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs outline-none transition",
                    active ? "bg-cyan-400/[0.08] text-cyan-200" : "text-slate-300",
                    "data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
