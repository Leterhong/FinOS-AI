"""Phase 7.1 Wealth Intelligence 验收脚本（需求十六）。

五项验收：
1. 设置退休目标 → 输出完整财富轨迹（Timeline + 退休缺口 + 达成概率）
2. 模拟「35 岁买房」→ 系统重算未来财富（净值/现金流/健康分/概率）
3. 修改收入 → 预测结果同步更新（缓存不得返回旧值）
4. 多 Agent 协作 → 输出完整分析（5 Agent + Strategy + Summary）
5. 历史记忆 → 影响后续分析（memoryUsed / 历史目标被引用）

附加校验：
6. 成本控制（未配置模型时 tier=local，零 LLM 调用）
7. 免责声明全覆盖 + 禁止绝对化/保证收益表述
8. 跨用户数据隔离
9. 无数据用户返回欢迎态（绝不伪造数字）

运行：
  "C:/Users/LENOVO/.workbuddy/binaries/python/envs/default/Scripts/python.exe" scripts/phase71_acceptance.py
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MIGRATE_LEGACY_DATA", "false")

from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

PASS: list[str] = []
FAIL: list[str] = []

BANNED_WORDS = ("绝对安全", "百分百安全", "完全安全", "保证收益", "稳赚", "必赚", "自动交易")
DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        PASS.append(name)
        print(f"  [PASS] {name}")
    else:
        FAIL.append(f"{name} — {detail}")
        print(f"  [FAIL] {name} — {detail}")


def register(c: TestClient, email: str) -> str:
    r = c.post("/api/auth/register", json={"email": email, "password": "Test@12345", "name": "验收用户"})
    if r.status_code != 200 or not r.json().get("success"):
        r = c.post("/api/auth/login", json={"email": email, "password": "Test@12345"})
    data = r.json()["data"]
    return data.get("token") or data.get("access_token") or data["finos_token"]


def h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def seed_profile(c: TestClient, token: str, *, age=35, income=45000.0, expense=22000.0, goal="10年内攒够500万退休"):
    c.post(
        "/api/financial/profile",
        json={"age": age, "income": income, "expense": expense, "riskLevel": "balanced", "goal": goal},
        headers=h(token),
    )
    for payload in (
        {"type": "cash", "name": "活期存款", "amount": 300000},
        {"type": "fund", "name": "指数基金", "amount": 600000},
        {"type": "stock", "name": "股票账户", "amount": 250000},
        {"type": "property", "name": "自住房", "amount": 1800000},
        {"type": "mortgage", "name": "房贷", "amount": 900000},
    ):
        c.post("/api/assets", json=payload, headers=h(token))


def scan_text(obj) -> str:
    import json

    return json.dumps(obj, ensure_ascii=False, default=str)


def main() -> int:
    with TestClient(app) as c:
        uid = uuid.uuid4().hex[:8]
        token = register(c, f"p71_{uid}@finos.local")
        seed_profile(c, token)

        print("\n[1] 退休目标 → 完整财富轨迹")
        r = c.post("/api/intelligence/predict", json={"retirementAge": 60, "refresh": True}, headers=h(token))
        check("预测接口 200", r.status_code == 200, f"HTTP {r.status_code}")
        d = r.json().get("data", {})
        check("预测有数据", d.get("hasData") is True, scan_text(d)[:200])
        tl = d.get("timeline", [])
        stages = [t["stage"] for t in tl]
        check("Timeline 含 现在/5年/10年/退休", len(tl) >= 4 and "现在" in stages and any("退休" in s for s in stages), str(stages))
        ret = d.get("retirement", {})
        check("退休测算可用且含缺口口径", ret.get("available") is True and "gap" in ret, scan_text(ret)[:200])
        goal = d.get("goal", {})
        check("目标达成概率 0-1", goal.get("available") and 0.0 <= goal.get("probability", -1) <= 1.0, scan_text(goal)[:200])
        check("预测携带显式假设", bool(d.get("assumptions", {}).get("annualReturn") is not None), scan_text(d.get("assumptions")))
        nw10 = next((m["netWorth"] for m in d.get("milestones", []) if m["year"] == 10), None)
        check("10 年净资产已计算", isinstance(nw10, (int, float)), str(nw10))

        # 概率可复现（同输入同结果）
        r2 = c.post("/api/intelligence/predict", json={"retirementAge": 60, "refresh": True}, headers=h(token))
        p2 = r2.json()["data"]["goal"]["probability"]
        check("蒙特卡洛结果可复现", abs(p2 - goal["probability"]) < 1e-9, f"{goal['probability']} vs {p2}")

        print("\n[2] 模拟「35 岁买房」→ 重算未来财富")
        r = c.post(
            "/api/intelligence/simulate",
            json={
                "eventType": "buy_house",
                "params": {"price": 3000000, "downPaymentRatio": 0.35, "loanYears": 30, "loanRate": 0.039},
                "horizon": 10,
                "useAi": False,
            },
            headers=h(token),
        )
        check("模拟接口 200", r.status_code == 200, f"HTTP {r.status_code}")
        sim = r.json().get("data", {})
        impact = sim.get("impact", {})
        check("返回 baseline/scenario/impact", all(k in sim for k in ("baseline", "scenario", "impact")), scan_text(list(sim.keys())))
        check("月结余因月供下降", impact.get("monthlySurplus", {}).get("delta", 0) < 0, scan_text(impact.get("monthlySurplus")))
        check("10 年净资产被重算", "netWorth10y" in impact, scan_text(list(impact.keys())))
        check("健康分被重算", "healthScore" in impact, scan_text(list(impact.keys())))
        exp = sim.get("explanation", {})
        check("解释为三段式", all(exp.get(k) for k in ("cause", "impact", "advice")), scan_text(exp)[:200])
        check("三段式文本含 原因/影响/建议", all(w in exp.get("text", "") for w in ("原因：", "影响：", "建议：")), exp.get("text", "")[:120])
        check("模拟已落库", bool(sim.get("simulationId")), "无 simulationId")

        print("\n[3] 修改收入 → 预测同步更新")
        before = c.post("/api/intelligence/predict", json={"retirementAge": 60}, headers=h(token)).json()["data"]
        nw10_before = next(m["netWorth"] for m in before["milestones"] if m["year"] == 10)
        c.post(
            "/api/financial/profile",
            json={"age": 35, "income": 80000.0, "expense": 22000.0, "riskLevel": "balanced", "goal": "10年内攒够500万退休"},
            headers=h(token),
        )
        after = c.post("/api/intelligence/predict", json={"retirementAge": 60}, headers=h(token)).json()["data"]
        nw10_after = next(m["netWorth"] for m in after["milestones"] if m["year"] == 10)
        check("收入提升后 10 年净资产上升", nw10_after > nw10_before, f"{nw10_before} → {nw10_after}")
        check("缓存未返回旧值", after.get("cached") is False, f"cached={after.get('cached')}")

        print("\n[4] 多 Agent 协作 → 完整分析")
        r = c.post("/api/intelligence/workflow", json={"question": "我该先还房贷还是先投资？", "useAi": False}, headers=h(token))
        check("工作流接口 200", r.status_code == 200, f"HTTP {r.status_code}")
        wf = r.json().get("data", {})
        agents = [f["agent"] for f in wf.get("findings", [])]
        check(
            "5 个分析 Agent 全部产出",
            set(agents) == {"cashflow", "investment", "risk", "retirement", "life_planner"},
            str(agents),
        )
        check("每个 Agent 均为三段式", all(f.get("explanation", {}).get("cause") for f in wf.get("findings", [])), str(agents))
        check("Strategy 输出短/中/长期", {x["key"] for x in wf.get("strategies", {}).get("horizons", [])} == {"short", "mid", "long"}, scan_text(wf.get("strategies", {}).get("horizons"))[:200])
        check("Summary 三段式", all(wf.get("summary", {}).get(k) for k in ("cause", "impact", "advice")), scan_text(wf.get("summary"))[:200])
        check("六维评分齐全", len(wf.get("score", {}).get("dimensions", [])) == 6, str(len(wf.get("score", {}).get("dimensions", []))))
        check("编排 trace 完整", len(wf.get("trace", [])) >= 4, scan_text(wf.get("trace"))[:200])

        print("\n[5] 历史记忆 → 影响后续分析")
        c.post("/api/intelligence/memories/sync", headers=h(token))
        mem = c.get("/api/intelligence/memories", headers=h(token)).json()["data"]["items"]
        kinds = {m["kind"] for m in mem}
        check("自动沉淀偏好/人生阶段记忆", {"preference", "life_stage"} <= kinds, str(kinds))
        check("历史目标被记入记忆", any("500" in m["content"] or "目标" in m["content"] for m in mem), scan_text(mem)[:200])
        c.post(
            "/api/intelligence/memories",
            json={"kind": "decision", "key": "test_decision", "content": "曾考虑 35 岁全款买房", "importance": 0.9},
            headers=h(token),
        )
        wf2 = c.post("/api/intelligence/workflow", json={"question": "复盘一下我的规划", "useAi": False}, headers=h(token)).json()["data"]
        check("分析引用了长期记忆", wf2.get("memoryUsed") is True, scan_text(wf2.get("memoryUsed")))
        check("财富变化记忆已生成", any(m["kind"] == "wealth_change" for m in c.get("/api/intelligence/memories", headers=h(token)).json()["data"]["items"]), "无 wealth_change")

        print("\n[6] 方案 A/B/C 对比")
        r = c.post(
            "/api/intelligence/compare",
            json={
                "plans": [
                    {"key": "A", "label": "现在买房", "events": [{"type": "buy_house", "params": {"price": 3000000}}]},
                    {"key": "B", "label": "推迟买房专注投资", "events": [{"type": "custom", "params": {"monthlyExpenseDelta": 2000}}]},
                    {"key": "C", "label": "换高薪工作", "events": [{"type": "job_change", "params": {"newMonthlyIncome": 100000, "gapMonths": 2}}]},
                ],
                "horizon": 10,
            },
            headers=h(token),
        )
        cmpd = r.json().get("data", {})
        check("三方案均返回结果", len(cmpd.get("plans", [])) == 3, str(len(cmpd.get("plans", []))))
        check("给出推荐方案与理由", bool(cmpd.get("recommended", {}).get("reason")), scan_text(cmpd.get("recommended")))
        check("方案含三段式解释", all(p.get("explanation", {}).get("advice") for p in cmpd.get("plans", [])), "缺少解释")

        print("\n[7] 成本控制 / 免责声明 / 安全表述")
        check("未配置模型时降级 local", wf.get("summary", {}).get("tier") == "local", scan_text(wf.get("summary", {}).get("tier")))
        for label, payload in (("预测", d), ("模拟", sim), ("工作流", wf), ("对比", cmpd)):
            check(f"{label}结果含免责声明", DISCLAIMER in scan_text(payload), "缺少免责声明")
        allt = scan_text([d, sim, wf, cmpd])
        hit = [w for w in BANNED_WORDS if w in allt]
        check("无绝对化/保证收益表述", not hit, f"命中：{hit}")

        print("\n[8] AI CFO 连续对话")
        r1 = c.post("/api/intelligence/chat", json={"message": "我的现金流健康吗？", "useAi": False}, headers=h(token))
        chat1 = r1.json().get("data", {})
        sid = chat1.get("sessionId")
        check("对话首轮返回 sessionId", bool(sid), scan_text(chat1)[:150])
        r2 = c.post("/api/intelligence/chat", json={"message": "那我该怎么改进？", "sessionId": sid, "useAi": False}, headers=h(token))
        chat2 = r2.json().get("data", {})
        check("上下文连续（turns 递增）", chat2.get("turns", 0) >= 2, scan_text(chat2.get("turns")))
        check("回复基于真实数据（含三段式）", all(chat2.get("explanation", {}).get(k) for k in ("cause", "impact", "advice")), scan_text(chat2)[:150])

        print("\n[9] 跨用户隔离 / 空数据欢迎态")
        token_b = register(c, f"p71b_{uuid.uuid4().hex[:8]}@finos.local")
        ov = c.get("/api/intelligence/overview", headers=h(token_b)).json()["data"]
        check("新用户返回欢迎态", ov.get("hasData") is False and "欢迎创建你的财富数字分身" in ov.get("message", ""), scan_text(ov)[:150])
        memb = c.get("/api/intelligence/memories", headers=h(token_b)).json()["data"]["items"]
        check("新用户看不到他人记忆", memb == [], scan_text(memb)[:150])
        simb = c.get("/api/intelligence/simulations", headers=h(token_b)).json()["data"]["items"]
        check("新用户看不到他人模拟记录", simb == [], scan_text(simb)[:150])
        wfb = c.post("/api/intelligence/workflow", json={"useAi": False}, headers=h(token_b)).json()["data"]
        check("新用户工作流不伪造数字", wfb.get("hasData") is False, scan_text(wfb)[:150])
        check("未登录被拒绝", c.get("/api/intelligence/overview").status_code in (401, 403), "未鉴权")

    print("\n" + "=" * 64)
    print(f"PASS = {len(PASS)}    FAIL = {len(FAIL)}")
    if FAIL:
        print("\n失败项：")
        for f in FAIL:
            print(f"  - {f}")
    print("=" * 64)
    return 1 if FAIL else 0


if __name__ == "__main__":
    raise SystemExit(main())
