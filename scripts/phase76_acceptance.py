#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 7.6 生产级后端验收脚本（零外部依赖，仅用 urllib + sqlite3）。

覆盖链路：
  1) 注册新用户 A / B
  2) 登录拿 access + refresh
  3) 会话(AIConversation) 创建 -> 列表（持久化证明）
  4) /refresh 轮换：旧 jti 复用 -> 401（吊销证明）
  5) /logout 吊销 refresh
  6) 重新密码登录 -> 会话仍在（跨重登持久化）
  7) /ai/usage 聚合结构 {usage, totals}（种子一条用量）
  8) /csrf 双提交令牌 + 非 httpOnly cookie
  9) /backup/export 整库导出：含模型掩码、绝不泄露明文 api_key
 10) 多租户隔离：用户 B 的会话与导出不得含 A 的数据
"""
import json
import os
import sqlite3
import sys
import time
import uuid
import datetime
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8300/api"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "backend", "data", "finos.db")

# 每次运行使用随机邮箱，避免与历史测试用户冲突导致重复注册 / 用量累积干扰断言。
_run = int(time.time())
results = []


def mark(name, ok, detail=""):
    results.append((name, ok, detail))
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}" + (f" — {detail}" if detail else ""))


def req(method, path, token=None, body=None, headers=None):
    url = BASE + path
    data = None
    hd = {}
    if token:
        hd["Authorization"] = "Bearer " + token
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hd["Content-Type"] = "application/json"
    if headers:
        hd.update(headers)
    r = urllib.request.Request(url, data=data, method=method, headers=hd)
    try:
        resp = urllib.request.urlopen(r, timeout=15)
        raw = resp.read().decode("utf-8")
        return resp.status, (json.loads(raw) if raw else None), resp.headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "ignore")
        try:
            body = json.loads(raw) if raw else None
        except Exception:
            body = None
        return e.code, body, e.headers


def data_of(env):
    return env.get("data") if isinstance(env, dict) else None


def seed_usage(uid, model, provider, rtype, tokens, it, ot):
    c = sqlite3.connect(DB)
    c.execute(
        "INSERT INTO ai_usage_logs (id, user_id, model, provider, tokens, input_tokens, output_tokens, latency_ms, request_type, created_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        (uuid.uuid4().hex, uid, model, provider, tokens, it, ot, 123, rtype, datetime.datetime.utcnow().isoformat()),
    )
    c.commit()
    c.close()


def main():
    email_a = f"phase76_a_{_run}@example.com"
    email_b = f"phase76_b_{_run}@example.com"
    pw = "Phase76!pass#2026"

    # ── 1) 注册 A / B ──
    st, env, _ = req("POST", "/auth/register", body={"email": email_a, "password": pw, "name": "AccA"})
    ok = st == 200 and env.get("success") and data_of(env).get("token")
    d_a = data_of(env) or {}
    token_a = d_a.get("token")
    refresh_a = d_a.get("refreshToken")
    uid_a = (d_a.get("user") or {}).get("id")
    mark("注册用户 A 并拿到 access+refresh", ok, f"uid={uid_a}")
    if not ok:
        print("FATAL: 无法注册 A，终止"); sys.exit(1)

    st, env, _ = req("POST", "/auth/register", body={"email": email_b, "password": pw, "name": "AccB"})
    ok = st == 200 and env.get("success") and data_of(env).get("token")
    token_b = (data_of(env) or {}).get("token")
    uid_b = ((data_of(env) or {}).get("user") or {}).get("id")
    mark("注册用户 B（隔离对照组）", ok, f"uid={uid_b}")

    # ── 2) 会话创建 + 列表（持久化）──
    st, env, _ = req("POST", "/ai/sessions", token=token_a,
                     body={"title": "A 的测试会话", "model": "gpt-4o", "messages": [{"role": "user", "content": "hi"}]})
    sid = (data_of(env) or {}).get("session", {}).get("id")
    ok = st == 200 and bool(sid)
    mark("A 创建 AI 会话（写入 ai_sessions）", ok, f"sid={sid}")

    st, env, _ = req("GET", "/ai/sessions", token=token_a)
    rows = (data_of(env) or {}).get("sessions", [])
    ok = st == 200 and any(r.get("id") == sid for r in rows)
    mark("A 会话列表包含刚创建的会话", ok, f"count={len(rows)}")

    # ── 3) /refresh 轮换 + 旧 jti 复用拒绝 ──
    st, env, _ = req("POST", "/auth/refresh", body={"refreshToken": refresh_a})
    d2 = data_of(env) or {}
    token_a2 = d2.get("token")
    refresh_a2 = d2.get("refreshToken")
    ok = st == 200 and token_a2 and refresh_a2 and refresh_a2 != refresh_a
    mark("A /refresh 成功轮换出新令牌对", ok, f"newRefresh!={refresh_a != refresh_a2}")

    # 旧 refresh 复用应被拒绝（吊销）
    st, env, _ = req("POST", "/auth/refresh", body={"refreshToken": refresh_a})
    ok = st == 401
    mark("旧 refresh 复用被拒绝（轮换吊销）", ok, f"status={st}")

    # ── 4) /csrf 双提交令牌 + 非 httpOnly cookie ──
    st, env, hd = req("GET", "/auth/csrf")
    csrf = (data_of(env) or {}).get("csrfToken")
    setck = hd.get("Set-Cookie", "")
    ok = st == 200 and bool(csrf) and ("finos_csrf=" in setck) and ("HttpOnly" not in setck)
    mark("/csrf 下发令牌且 cookie 非 HttpOnly", ok, f"cookie_has_finos_csrf={'finos_csrf=' in setck}, no_httponly={'HttpOnly' not in setck}")

    # ── 5) /ai/usage 聚合结构 ──
    seed_usage(uid_a, "gpt-4o", "openai", "generate", 1500, 500, 1000)
    st, env, _ = req("GET", "/ai/usage", token=token_a)
    du = data_of(env) or {}
    usage_rows = du.get("usage", [])
    totals = du.get("totals", {})
    ok = st == 200 and isinstance(usage_rows, list) and len(usage_rows) >= 1
    ok = ok and all(k in usage_rows[0] for k in ("model", "provider", "requestType", "calls", "tokens", "inputTokens", "outputTokens", "avgLatencyMs")) if usage_rows else False
    ok = ok and all(k in totals for k in ("calls", "tokens", "inputTokens", "outputTokens"))
    ok = ok and totals.get("inputTokens", 0) == 500 and totals.get("outputTokens", 0) == 1000
    mark("/ai/usage 返回新结构 {usage,totals} 且聚合正确", ok,
         f"rows={len(usage_rows)}, totals_in={totals.get('inputTokens')}, out={totals.get('outputTokens')}")

    # ── 6) /logout 吊销 refresh ──
    st, env, _ = req("POST", "/auth/logout", token=token_a2, body={"refreshToken": refresh_a2})
    ok = st == 200
    mark("A /logout 成功", ok, f"status={st}")
    st, env, _ = req("POST", "/auth/refresh", body={"refreshToken": refresh_a2})
    ok = st == 401
    mark("注销后的 refresh 不能再次刷新（吊销生效）", ok, f"status={st}")

    # ── 7) 重新密码登录 -> 会话仍在（跨重登持久化）──
    st, env, _ = req("POST", "/auth/login", body={"email": email_a, "password": pw})
    token_a3 = (data_of(env) or {}).get("token")
    ok = st == 200 and token_a3
    mark("A 重新密码登录成功", ok)
    st, env, _ = req("GET", "/ai/sessions", token=token_a3)
    rows = (data_of(env) or {}).get("sessions", [])
    ok = st == 200 and any(r.get("id") == sid for r in rows)
    mark("重新登录后 A 的会话仍在（持久化）", ok, f"count={len(rows)}")

    # ── 8) /backup/export 密钥不泄露 + 含掩码 ──
    # 先给 A 建一个模型配置（含明文 api_key，后端应加密且仅掩码导出）
    st, env, _ = req("POST", "/ai/models", token=token_a3,
                     body={"name": "测试模型", "provider": "openai-compatible",
                           "base_url": "https://api.openai.com/v1", "model_id": "gpt-4o",
                           "api_key": "sk-TESTSECRET123", "is_default": True})
    ok = st == 200 and (data_of(env) or {}).get("id")
    mark("A 创建含密钥的模型配置", ok)

    st, env, _ = req("GET", "/backup/export?format=json", token=token_a3)
    raw_text = json.dumps(env, ensure_ascii=False)
    ok = st == 200
    leak = "sk-TESTSECRET123" in raw_text
    has_mask = "keyMask" in raw_text or "sk-***" in raw_text
    ok = ok and (not leak) and has_mask
    mark("/backup/export 不泄露明文 api_key 且含掩码", ok, f"leak_plaintext={leak}, has_mask={has_mask}")

    # ── 9) 多租户隔离：B 看不到 A 的数据 ──
    st, env, _ = req("GET", "/ai/sessions", token=token_b)
    b_rows = (data_of(env) or {}).get("sessions", [])
    ok = st == 200 and len(b_rows) == 0
    mark("B 的会话列表为空（隔离 A）", ok, f"b_count={len(b_rows)}")

    st, env, _ = req("GET", "/backup/export?format=json", token=token_b)
    b_text = json.dumps(env, ensure_ascii=False)
    ok = st == 200 and ("A 的测试会话" not in b_text) and ("sk-TESTSECRET123" not in b_text)
    mark("B 的整库导出不含 A 的会话/密钥（隔离）", ok, f"contains_A_session={'A 的测试会话' in b_text}")

    # ── 汇总 ──
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print("\n" + "=" * 56)
    print(f"Phase 7.6 验收：{passed}/{total} 通过")
    print("=" * 56)
    failed = [n for n, ok, _ in results if not ok]
    if failed:
        print("失败项：")
        for f in failed:
            print("  - " + f)
        sys.exit(1)
    print("全部通过 ✅")
    sys.exit(0)


if __name__ == "__main__":
    main()
