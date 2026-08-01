#!/usr/bin/env python3
# Phase 7.2 前端冒烟：注册 -> 补种 Next cookie -> /assistant 渲染 + 新接口契约
import json
import urllib.request
import urllib.error
import http.cookiejar
import sys

BASE = "http://localhost:8300"
NEXT = "http://localhost:3000"
import time
EMAIL = "smoke_assistant_%d@finos.local" % (int(time.time()),)
PW = "Smoke@123456"
NAME = "SmokeAssistant"

def post(url, body, headers=None, cookiejar=None):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    return _do(req, cookiejar)

def get(url, headers=None, cookiejar=None):
    req = urllib.request.Request(url, method="GET")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    return _do(req, cookiejar)

def _do(req, cookiejar):
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookiejar))
    try:
        with opener.open(req, timeout=30) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")

def find_token(obj):
    if isinstance(obj, dict):
        for k in ("token", "access_token", "jwt", "accessToken"):
            if k in obj and isinstance(obj[k], str):
                return obj[k]
        if "data" in obj:
            return find_token(obj["data"])
    return None

cj = http.cookiejar.CookieJar()
print("== 1) register ==")
st, body = post(f"{BASE}/api/auth/register", {"email": EMAIL, "password": PW, "name": NAME}, cookiejar=cj)
print("register status:", st)
try:
    token = find_token(json.loads(body))
except Exception:
    token = None
print("token found:", bool(token))
if not token:
    print("BODY:", body[:500])
    sys.exit(1)

print("== 2) set Next session cookie ==")
st, body = post(f"{NEXT}/api/auth/session", {}, headers={"Authorization": f"Bearer {token}"}, cookiejar=cj)
print("session status:", st, body[:120])

print("== 3) GET /assistant (expect 200) ==")
st, body = get(f"{NEXT}/assistant", cookiejar=cj)
print("assistant status:", st, "size:", len(body))
print("contains 'AI 助手':", "AI 助手" in body)

print("== 4) multimodal/capabilities ==")
st, body = get(f"{BASE}/api/multimodal/capabilities", headers={"Authorization": f"Bearer {token}"}, cookiejar=cj)
print("status:", st)
caps = json.loads(body)
print("modalities:", caps.get("data", {}).get("modalities"), "confirmRequired:", caps.get("data", {}).get("confirmRequired"))

print("== 5) agents/market ==")
st, body = get(f"{BASE}/api/agents/market", headers={"Authorization": f"Bearer {token}"}, cookiejar=cj)
mkt = json.loads(body)
print("status:", st, "agent count:", len(mkt.get("data", {}).get("items", [])))

print("== 6) reports/kinds ==")
st, body = get(f"{BASE}/api/reports/kinds", headers={"Authorization": f"Bearer {token}"}, cookiejar=cj)
kinds = json.loads(body)
print("status:", st, "kinds:", [k.get("kind") for k in kinds.get("data", {}).get("items", [])])

print("== 7) multimodal/pending (new user -> empty) ==")
st, body = get(f"{BASE}/api/multimodal/pending", headers={"Authorization": f"Bearer {token}"}, cookiejar=cj)
pend = json.loads(body)
print("status:", st, "count:", pend.get("data", {}).get("count"))

print("== 8) agents/runs (new user -> empty) ==")
st, body = get(f"{BASE}/api/agents/runs", headers={"Authorization": f"Bearer {token}"}, cookiejar=cj)
runs = json.loads(body)
print("status:", st, "count:", len(runs.get("data", {}).get("items", [])))

print("== 9) multimodal/text ingest (识别需确认) ==")
st, body = post(f"{BASE}/api/multimodal/text", {"text": "我月薪两万，持有贵州茅台 100 股，目标攒 500 万退休", "useAi": True}, headers={"Authorization": f"Bearer {token}"}, cookiejar=cj)
ing = json.loads(body)
data = ing.get("data", {})
print("status:", st, "needsConfirm:", data.get("needsConfirm"), "extractions:", len(data.get("extractions", [])))
for e in data.get("extractions", [])[:5]:
    print("   -", e.get("kind"), e.get("label"), e.get("amount"))

print("DONE")
