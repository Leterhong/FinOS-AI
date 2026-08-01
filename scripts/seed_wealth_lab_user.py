"""为 /wealth-lab 页面浏览器验证准备一个带完整财务数据的测试账号，输出 token。"""
import json
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8300/api"
EMAIL = "wlab_ui@example.com"
PW = "Smoke123!"
HEADERS = {"Content-Type": "application/json"}


def call(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HEADERS)
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def main():
    s, reg = call("POST", "/auth/register", {"email": EMAIL, "password": PW, "name": "实验室UI"})
    if s == 200 and reg.get("success"):
        token = reg["data"]["token"]
        fresh = True
    else:
        s, login = call("POST", "/auth/login", {"email": EMAIL, "password": PW})
        assert login.get("success"), f"login failed: {login}"
        token = login["data"]["token"]
        fresh = False

    if fresh:
        call("POST", "/financial/profile",
             {"age": 32, "income": 30000, "expense": 15000, "risk_level": "balanced",
              "goal": "10年内攒够500万退休"}, token)

    # 资产为空则补建（路径 /assets，金额字段 amount）
    s, cur = call("GET", "/assets", token=token)
    existing = cur.get("data") if isinstance(cur.get("data"), list) else []
    if not existing:
        for a in [
            {"type": "cash", "name": "活期存款", "amount": 180000},
            {"type": "property", "name": "自住房", "amount": 2600000},
            {"type": "liability", "name": "房贷", "amount": 1400000},
            {"type": "fund", "name": "指数基金", "amount": 320000},
            {"type": "insurance", "name": "重疾险", "amount": 500000},
        ]:
            st, r = call("POST", "/assets", a, token)
            assert st == 200, f"asset {a} -> {st} {r}"
        call("POST", "/twin/recalculate", {}, token)

    s, ov = call("GET", "/intelligence/overview", token=token)
    cur = ov.get("data", {}).get("current", {})
    print(json.dumps({
        "token": token,
        "email": EMAIL,
        "fresh": fresh,
        "hasData": ov.get("data", {}).get("hasData"),
        "netWorth": cur.get("netWorth"),
        "totalAssets": cur.get("totalAssets"),
        "score": ov.get("data", {}).get("score", {}).get("totalScore"),
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
