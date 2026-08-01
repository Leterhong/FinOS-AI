import json
import urllib.request
import urllib.error

BASE = "http://localhost:8300/api"
EMAIL = "wlab_smoke_{}@example.com".format(__import__("time").time_ns())
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
    # 注册
    s, reg = call("POST", "/auth/register", {"email": EMAIL, "password": PW, "name": "实验室冒烟"})
    print("register", s, reg.get("success"))
    token = reg.get("data", {}).get("token")
    assert token, f"no token: {reg}"
    # 登录
    s, login = call("POST", "/auth/login", {"email": EMAIL, "password": PW})
    print("login", s, login.get("success"))
    # 建档
    s, prof = call("POST", "/financial/profile",
                    {"age": 32, "income": 30000, "expense": 15000, "risk_level": "balanced",
                     "goal": "10年内攒够500万退休"}, token)
    print("profile", s, prof.get("success"), "hasData=", prof.get("data", {}).get("hasData"))
    # 资产
    assets = [
        {"type": "cash", "name": "活期+货基", "amount": 250000},
        {"type": "property", "name": "自住房", "amount": 1800000},
        {"type": "liability", "name": "房贷", "amount": 900000},
        {"type": "fund", "name": "基金", "amount": 350000},
        {"type": "insurance", "name": "年金险", "amount": 120000},
    ]
    for a in assets:
        s, r = call("POST", "/assets", a, token)
        assert s == 200, f"asset {a} -> {s} {r}"
    print("assets created:", len(assets))
    # overview
    s, ov = call("GET", "/intelligence/overview", token=token)
    d = ov.get("data", {})
    print("\n[overview]", s, "hasData=", d.get("hasData"))
    print("  score dims:", len(d.get("score", {}).get("dimensions", [])))
    print("  totalScore:", d.get("score", {}).get("totalScore"))
    print("  series len:", len(d.get("series", [])))
    print("  timeline stages:", len(d.get("timeline", [])))
    print("  events:", len(d.get("events", [])))
    print("  retirement available:", d.get("retirement", {}).get("available"))
    print("  goal available:", d.get("goal", {}).get("available"), "prob=", d.get("goal", {}).get("probability"))
    # predict
    s, pr = call("POST", "/intelligence/predict", {"retirementAge": 60}, token=token)
    print("\n[predict]", s, "series:", len(pr.get("data", {}).get("series", [])))
    # score
    s, sc = call("GET", "/intelligence/score", token=token)
    print("[score]", s, "totalScore:", sc.get("data", {}).get("totalScore"),
          "weakest:", sc.get("data", {}).get("weakest", {}).get("label"))
    # events
    s, ev = call("GET", "/intelligence/events", token=token)
    print("[events]", s, "count:", len(ev.get("data", {}).get("events", [])))
    # simulate
    s, sim = call("POST", "/intelligence/simulate",
                   {"eventType": "buy_house", "params": {"price": 2500000, "downPaymentRatio": 0.3}, "persist": True},
                   token=token)
    sd = sim.get("data", {})
    print("\n[simulate]", s, "hasData=", sd.get("hasData"), "impact keys:", list(sd.get("impact", {}).keys())[:4],
          "exp tiers:", sd.get("explanation", {}).get("tier"))
    # compare
    s, cmp = call("POST", "/intelligence/compare", {"plans": [
        {"key": "A", "label": "现在买房", "events": [{"type": "buy_house", "params": {"price": 2500000}}]},
        {"key": "B", "label": "先换工作", "events": [{"type": "job_change", "params": {"newMonthlyIncome": 38000}}]},
        {"key": "C", "label": "维持现状", "events": []},
    ]}, token=token)
    cd = cmp.get("data", {})
    print("[compare]", s, "plans:", len(cd.get("plans", [])), "recommended:", cd.get("recommended", {}).get("label"))
    # workflow
    s, wf = call("POST", "/intelligence/workflow", {"question": "", "useAi": False}, token=token)
    wd = wf.get("data", {})
    print("[workflow]", s, "findings:", len(wd.get("findings", [])), "trace steps:", len(wd.get("trace", [])),
          "summary tier:", wd.get("summary", {}).get("tier"))
    print("\nOK - 全链路冒烟通过")


if __name__ == "__main__":
    main()
