"use client";

/**
 * 账号对话框：邮箱登录 / 注册。
 *
 * 登录后企业数据与治理权限归属该邮箱账号，被邀请成员可用被邀请邮箱登录后确认加入。
 * 未登录时保持免登录 guest 工作区（单机体验）。
 */
import { type FormEvent, useEffect, useState } from "react";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { type BackendAccount, backendAuthedFetch, bindWorkspaceToAccount, loginAccount, logoutAccount, registerAccount } from "@/lib/enterprise-sync";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { toast } from "@/components/feedback/toast";

export default function AccountDialog({
  open,
  account,
  initialEmail,
  onClose,
  onSuccess,
  onLogout,
}: {
  open: boolean;
  account: BackendAccount | null;
  initialEmail?: string;
  onClose: () => void;
  onSuccess: () => void;
  onLogout: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const signedIn = Boolean(account && !account.guest);

  useEffect(() => {
    if (open && initialEmail) {
      setEmail(initialEmail);
      setMode("register");
    }
  }, [open, initialEmail]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (email || String(form.get("email") || "")).trim();
    const password = String(form.get("password") || "");
    if (!value || !password) {
      setError("请填写邮箱和密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const account = mode === "login" ? await loginAccount(value, password) : await registerAccount(value, password);
      // 跨账号保护：本地工作区若归属其它账号，先清空再绑定，避免数据串号。
      if (account && !account.guest) {
        useEnterpriseStore.getState().guardWorkspaceOwnership(account.id);
      }
      // 绑定 Next 工作区并迁移本地访客数据到该账号，然后重载以刷新全部会话。
      await bindWorkspaceToAccount();
      await useEnterpriseStore.getState().pushAllToBackend();
      toast.success(mode === "login" ? "已登录账号，本地数据已迁移" : "账号已创建并登录，本地数据已迁移");
      onSuccess();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "账号操作失败");
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (deleteBusy) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const resp = await backendAuthedFetch("/api/security/account", {
        method: "DELETE",
        body: JSON.stringify({ password, confirmation }),
      });
      const payload = await resp.json().catch(() => null) as { error?: string } | null;
      if (!resp.ok) throw new Error(payload?.error || "账户删除失败");
      // 清理 Next 侧残留（模型/技能/用量文件 + 内存缓存 + 会话 cookie）。
      await fetch("/api/account/purge", { method: "POST" }).catch(() => undefined);
      useEnterpriseStore.getState().purgeLocalWorkspace();
      try { window.localStorage.removeItem("finos-workspace-owner"); } catch { /* 忽略 */ }
      await logoutAccount();
      toast.success("账户及关联数据已删除");
      window.location.reload();
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "账户删除失败");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <EnterpriseDialog
      open={open}
      onClose={onClose}
      title="账号与邀请"
      description="登录后企业数据与治理权限归属该邮箱账号；被邀请成员需用被邀请邮箱登录后确认加入。"
    >
      <div className="p-5">
        {signedIn ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="text-[10px] text-slate-500">当前登录账号</p>
              <p className="mt-1 truncate text-xs text-slate-200">{account?.email}</p>
              <p className="mt-2 text-[10px] text-slate-400">企业数据与治理权限已归属该账号，被邀请的成员可用此邮箱确认加入。</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">关闭</button>
              <button type="button" onClick={onLogout} className="rounded-xl border border-rose-400/25 px-4 py-2.5 text-xs text-rose-200 hover:bg-rose-400/[0.06]">退出登录</button>
            </div>
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.03] p-4">
              {!deleteOpen ? (
                <button type="button" onClick={() => { setDeleteOpen(true); setDeleteError(""); }} className="text-[11px] text-rose-300 hover:text-rose-200">删除账户及全部关联数据</button>
              ) : (
                <form onSubmit={removeAccount} className="space-y-3">
                  <p className="text-[11px] leading-5 text-rose-200/80">此操作不可恢复：将删除账号、企业数据、上传文件、模型与技能配置及用量记录。</p>
                  <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">当前密码</span><input required name="password" type="password" autoComplete="current-password" className="field-control" /></label>
                  <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">输入 DELETE MY DATA 确认</span><input required name="confirmation" placeholder="DELETE MY DATA" className="field-control" /></label>
                  {deleteError && <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2 text-[11px] text-rose-200">{deleteError}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button>
                    <button type="submit" disabled={deleteBusy} className="rounded-xl border border-rose-400/30 bg-rose-400/[0.08] px-4 py-2.5 text-xs text-rose-100 disabled:opacity-40">{deleteBusy ? "删除中…" : "确认删除账户"}</button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              {(["login", "register"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setMode(item); setError(""); }}
                  className={`rounded-xl border px-3 py-2 text-[11px] transition ${mode === item ? "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-200" : "border-white/[0.08] text-slate-500"}`}
                >
                  {item === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] text-slate-400">邮箱</span>
                <input required name="email" type="email" autoComplete="email" placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} className="field-control" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] text-slate-400">密码</span>
                <input required name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="至少 8 位" className="field-control" />
              </label>
              {error && <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-3 py-2 text-[11px] text-rose-200">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button>
                <button type="submit" disabled={busy} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:opacity-40">
                  {busy ? "处理中…" : mode === "login" ? "登录" : "注册并登录"}
                </button>
              </div>
              <p className="text-[10px] leading-5 text-slate-400">未登录时使用免登录访客工作区，仅本浏览器可见；登录后数据与权限绑定账号，可接受他人邀请并跨设备访问。</p>
            </form>
          </>
        )}
      </div>
    </EnterpriseDialog>
  );
}
