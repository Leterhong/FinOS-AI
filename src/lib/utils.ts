import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number, prefix = "¥"): string {
  if (Math.abs(n) >= 1_000_000) {
    return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  }
  return `${prefix}${Math.round(n).toLocaleString("zh-CN")}`;
}

export function formatCurrencyFull(n: number, prefix = "¥"): string {
  return `${prefix}${Math.round(n).toLocaleString("zh-CN")}`;
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals)}%`;
}

export function shortNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
