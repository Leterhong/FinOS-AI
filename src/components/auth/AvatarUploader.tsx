"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, Check, X } from "lucide-react";
import { useAuthStore } from "@/store/auth-store";
import { cn } from "@/lib/utils";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const OUTPUT = 512; // 输出方形边长（px）

/**
 * Phase 5.6 头像上传 / 裁剪 / 预览 / 删除组件。
 * - 选择图片后在浏览器端用 canvas 做居中方形裁剪并压缩为 dataURL
 * - 上传至 /api/auth/avatar（服务端按 session 隔离），成功后更新 auth-store
 * - 支持删除（恢复默认首字母头像）
 */
export default function AvatarUploader({
  size = 96,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const currentUser = useAuthStore((s) => s.currentUser);
  const setUser = useAuthStore((s) => s.setUser);

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null); // 裁剪后的 dataURL 预览
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarUrl = currentUser?.avatarUrl ?? null;
  const initial = (currentUser?.name || currentUser?.email || "U")
    .slice(0, 1)
    .toUpperCase();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 允许再次选择同一文件
    e.target.value = "";
    if (!file) return;
    setError(null);

    if (!ACCEPT.includes(file.type)) {
      setError("仅支持 JPG / PNG / WebP 格式");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("原图过大（请小于 8MB）");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = OUTPUT;
          canvas.height = OUTPUT;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setError("浏览器不支持图像裁剪");
            return;
          }
          ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT, OUTPUT);
          // PNG 保留透明；其余转 JPEG 以减小体积
          const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
          const dataUrl = canvas.toDataURL(mime, 0.85);
          setPreview(dataUrl);
        } catch {
          setError("图像解析失败，请换一张");
        }
      };
      img.onerror = () => setError("图像解析失败，请换一张");
      img.src = reader.result as string;
    };
    reader.onerror = () => setError("文件读取失败");
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: preview }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        user?: import("@/auth/types").PublicUser;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.user) {
        setError(data.error ?? "上传失败");
        return;
      }
      setUser(data.user);
      setPreview(null);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/avatar", { method: "DELETE" });
      const data = (await res.json()) as {
        ok: boolean;
        user?: import("@/auth/types").PublicUser;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.user) {
        setError(data.error ?? "删除失败");
        return;
      }
      setUser(data.user);
    } catch {
      setError("网络错误");
    } finally {
      setBusy(false);
    }
  };

  // 仅在确为内联 data URL 时回退到已存储头像，避免对已失效的路径类 avatarUrl 发起 404 请求
  const shown = preview ?? (avatarUrl?.startsWith("data:") ? avatarUrl : null);

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <div className="h-full w-full overflow-hidden rounded-2xl bg-gradient-brand shadow-glow-blue">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt="头像"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white">
              {initial}
            </div>
          )}
        </div>

        {/* 更换按钮（覆盖在头像右下角） */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="上传 / 更换头像"
          className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
        >
          <Camera className="h-4 w-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT.join(",")}
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* 操作区 */}
      <div className="flex items-center gap-2">
        {preview ? (
          <>
            <button
              type="button"
              onClick={handleUpload}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-1.5 text-xs font-medium text-white shadow-glow-blue transition-all hover:scale-[1.02] disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              保存
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:bg-white/[0.06]"
            >
              <X className="h-3.5 w-3.5" />
              取消
            </button>
          </>
        ) : (
          avatarUrl && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 transition-colors hover:border-red-500/30 hover:text-red-400 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              删除头像
            </button>
          )
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-center text-[11px] text-white/30">
        支持 JPG / PNG / WebP，自动裁剪为方形
      </p>
    </div>
  );
}
