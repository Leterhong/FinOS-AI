"use client";

import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * 弹窗/抽屉焦点管理：打开时把焦点移入容器并把 Tab 限制在容器内，
 * 关闭时把焦点归还给打开前的触发元素。容器需可聚焦（tabIndex={-1}）作为无焦点元素时的兜底。
 */
export function useFocusTrap<T extends HTMLElement>(open: boolean, containerRef: RefObject<T | null>) {
  const previousRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    previousRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getAttribute("aria-hidden") !== "true",
      );

    (focusables()[0] ?? container).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      const previous = previousRef.current;
      if (previous && typeof previous.focus === "function" && document.contains(previous)) previous.focus();
    };
  }, [open, containerRef]);
}
