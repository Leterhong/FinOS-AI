"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "finos-theme";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/** 深色 / 浅色主题切换按钮：偏好写入 localStorage，由内联脚本在首屏绘制前应用，避免闪烁。 */
export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // 以内联脚本已应用到 <html> 的实际主题为准，保证图标与实际显示一致。
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
    // 用户未手动选择时，跟随系统深浅色实时变化。
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      try {
        if (window.localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {
        /* 隐私模式读取失败时仍跟随系统 */
      }
      const next: Theme = media.matches ? "light" : "dark";
      setTheme(next);
      applyTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* 隐私模式下写入失败时仍保留本次会话内的切换 */
    }
  };

  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? "切换到深色模式" : "切换到浅色模式"}
      aria-pressed={isLight}
      title={isLight ? "切换到深色模式" : "切换到浅色模式"}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 transition hover:text-white",
        className,
      )}
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
