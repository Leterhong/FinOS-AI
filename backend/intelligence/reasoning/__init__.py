"""AI 解释层（Phase 7.1 需求九）：强制「原因 / 影响 / 建议」三段式。"""

from backend.intelligence.reasoning.explain import (
    Explanation,
    llm_available,
    make_explanation,
    render_text,
    enhance_with_llm,
)

__all__ = ["Explanation", "make_explanation", "render_text", "enhance_with_llm", "llm_available"]
