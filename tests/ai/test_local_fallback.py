"""AI 质量测试：不依赖任何大模型的确定性算法层。

FinOS AI 的核心承诺是「无模型也能用」——所有智能能力都必须有本地确定性
兜底。本文件验证这些兜底算法的正确性与边界行为，它们是 AI 降级链的最后一环，
一旦失效整个产品会在无模型环境下白屏。
"""
from __future__ import annotations

import pytest

from backend.intelligence.context import parse_goal_amount


# ---------------------------------------------------------------- 目标金额解析
@pytest.mark.parametrize(
    "goal,expected",
    [
        # 带单位：万 / 亿 / w / k
        ("10年内攒够500万退休", 5_000_000),
        ("攒够1亿", 100_000_000),
        ("目标100w", 1_000_000),
        ("存够500k", 500_000),
        ("3年内存到50万", 500_000),
        # 显式「元」
        ("目标 1200000 元", 1_200_000),
        ("攒够800000元买房", 800_000),
        # 裸数字：量级足够大才视为金额
        ("目标 2000000", 2_000_000),
    ],
)
def test_parse_goal_amount_extracts_correct_value(goal, expected):
    assert parse_goal_amount(goal) == expected


@pytest.mark.parametrize(
    "goal",
    [
        None,
        "",
        "55岁退休",            # 年龄不是金额
        "10年内实现财务自由",   # 「10年」是时间不是金额
        "希望生活更从容",       # 无数字
        "3年内换工作",          # 数字量级过小
    ],
)
def test_parse_goal_amount_returns_none_for_non_amounts(goal):
    assert parse_goal_amount(goal) is None, f"「{goal}」不应被解析为金额"


def test_parse_goal_amount_ignores_year_prefix():
    """经典陷阱：「10年内攒够500万」绝不能取到 10。"""
    assert parse_goal_amount("10年内攒够500万退休") == 5_000_000


def test_parse_goal_amount_handles_thousand_separator():
    assert parse_goal_amount("目标 1,500,000 元") == 1_500_000


# ---------------------------------------------------------------- 六维评分
def _rich_ctx(**overrides):
    """构造一个有数据的财富上下文。"""
    from backend.intelligence.context import WealthContext

    base = dict(
        has_data=True,
        age=33,
        risk_level="balanced",
        monthly_income=28000.0,
        monthly_expense=13000.0,
        goal_text="10年内攒够500万退休",
        goal_amount=5_000_000,
        allocation={"cash": 180000.0, "stock": 420000.0, "fund": 260000.0,
                    "property": 2_200_000.0, "insurance": 60000.0},
        total_assets=3_120_000.0,
        total_liabilities=800_000.0,
    )
    base.update(overrides)
    return WealthContext(**base)


def test_score_wealth_returns_six_dimensions():
    from backend.intelligence.scoring.engine import score_wealth

    result = score_wealth(_rich_ctx())
    assert result["hasData"] is True, "有数据上下文不应返回欢迎态"
    assert "totalScore" in result, f"评分结果缺少总分: {list(result.keys())}"
    assert result["level"], "应给出健康等级"

    dims = result["dimensions"]
    assert len(dims) == 6, f"财富健康分必须为六维，实际 {len(dims)} 维"
    expected = {"asset", "cashflow", "risk", "goal", "investment", "protection"}
    assert {d["key"] for d in dims} == expected, f"六维口径不符: {[d['key'] for d in dims]}"
    assert abs(sum(d["weight"] for d in dims) - 1.0) < 0.01, "各维度权重之和应为 1"


def test_score_is_bounded_0_to_100():
    from backend.intelligence.scoring.engine import score_wealth

    result = score_wealth(_rich_ctx())
    assert 0 <= float(result["totalScore"]) <= 100, f"总分越界: {result['totalScore']}"

    for dim in result["dimensions"]:
        assert 0 <= float(dim["score"]) <= 100, f"维度 {dim['key']} 分值越界: {dim['score']}"


def test_score_returns_welcome_state_for_empty_context():
    """零数据铁律：无数据时返回欢迎文案，绝不编造分数。"""
    from backend.intelligence.scoring.engine import score_wealth
    from backend.intelligence.context import WealthContext

    result = score_wealth(WealthContext())
    assert result["hasData"] is False
    assert "欢迎" in result["message"]
    assert "totalScore" not in result, "零数据时不得给出任何编造的分数"


def test_score_result_carries_disclaimer():
    """所有决策辅助输出必须附带免责声明。"""
    from backend.intelligence.scoring.engine import score_wealth
    from backend.intelligence.context import WealthContext

    for ctx in (WealthContext(), _rich_ctx()):
        result = score_wealth(ctx)
        text = str(result)
        assert "不构成投资建议" in text, "输出缺少免责声明"


def test_score_degrades_gracefully_on_extreme_values():
    """极端输入（零收入 / 负净值 / 超大资产）不得让评分崩溃或越界。"""
    from backend.intelligence.scoring.engine import score_wealth

    extremes = [
        _rich_ctx(monthly_income=0.0, monthly_expense=0.0),
        _rich_ctx(total_assets=0.0, total_liabilities=500_000.0),
        _rich_ctx(total_assets=9_999_999_999.0, allocation={"cash": 9_999_999_999.0}),
    ]
    for ctx in extremes:
        result = score_wealth(ctx)
        assert 0 <= float(result["totalScore"]) <= 100, f"极端输入下总分越界: {result['totalScore']}"


# ---------------------------------------------------------------- 免责声明口径
def test_no_absolute_safety_claims_in_intelligence_layer():
    """合规红线：产品文案不得出现「绝对安全 / 百分百 / 完全安全」等表述。"""
    import pathlib

    banned = ["绝对安全", "百分百", "100%安全", "完全安全", "保证收益", "稳赚"]
    root = pathlib.Path(__file__).resolve().parents[2] / "backend"
    offenders: list[str] = []
    for path in root.rglob("*.py"):
        if "__pycache__" in str(path):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for word in banned:
            if word in text:
                offenders.append(f"{path.relative_to(root.parent)}: {word}")
    assert not offenders, "发现违规表述:\n" + "\n".join(offenders)
