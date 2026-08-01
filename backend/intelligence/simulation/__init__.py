"""人生事件模拟子域（Phase 7.1 需求四 + 十二）。"""

from backend.intelligence.simulation.events import EVENT_CATALOG, apply_event, list_events
from backend.intelligence.simulation.engine import compare_plans, simulate_event

__all__ = ["EVENT_CATALOG", "apply_event", "list_events", "simulate_event", "compare_plans"]
