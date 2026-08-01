"""多模态路由子域（Phase 7.2 需求二）。"""
from backend.multimodal.router.dispatcher import detect_modality, dispatch, validate_size

__all__ = ["detect_modality", "dispatch", "validate_size"]
