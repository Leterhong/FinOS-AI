"""Voice Agent + Speech Pipeline（Phase 7.2 需求五/六）。

Speech Pipeline：
    Audio Input → STT → Intent → Financial Agent → Response

STT 分级（零硬依赖）：
  1. 前端已用浏览器 Web Speech API 转写好的 transcript（首选，零成本、零依赖）
  2. 本地 faster-whisper / openai-whisper（可选安装）
  3. 都不可用 → 明确提示用户改用文字输入，绝不编造内容
"""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from backend.multimodal.text.analyzer import TextAnalysis, analyze_text
from backend.multimodal.text.extractor import Entity
from backend.user.models import User


@dataclass
class SpeechResult:
    ok: bool = False
    transcript: str = ""
    stt_engine: str = "none"  # client / whisper / none
    analysis: TextAnalysis | None = None
    entities: list[Entity] = field(default_factory=list)
    summary: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "transcript": self.transcript,
            "sttEngine": self.stt_engine,
            "analysis": self.analysis.to_dict() if self.analysis else None,
            "entities": [e.to_dict() for e in self.entities],
            "summary": self.summary,
            "message": self.message,
        }


def local_stt(data: bytes, filename: str = "audio.wav") -> tuple[str, str]:
    """本地语音转写。返回 (text, engine)；不可用返回 ("", "none")。"""
    suffix = os.path.splitext(filename)[1] or ".wav"
    path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as fp:
            fp.write(data)
            path = fp.name
    except OSError:
        return "", "none"

    try:
        try:
            from faster_whisper import WhisperModel  # type: ignore

            model = WhisperModel("base", device="cpu", compute_type="int8")
            segments, _ = model.transcribe(path, language="zh")
            return " ".join(s.text.strip() for s in segments).strip(), "faster-whisper"
        except Exception:  # noqa: BLE001
            pass
        try:
            import whisper  # type: ignore

            model = whisper.load_model("base")
            return str(model.transcribe(path, language="zh").get("text", "")).strip(), "whisper"
        except Exception:  # noqa: BLE001
            return "", "none"
    finally:
        try:
            if path:
                os.unlink(path)
        except OSError:
            pass


def process_speech(
    db: Session,
    user: User,
    *,
    audio: bytes | None = None,
    filename: str = "",
    transcript: str = "",
) -> SpeechResult:
    """语音财富助手主入口：转写 → 意图 → 实体（绝不写库）。"""
    engine = "none"
    text = (transcript or "").strip()
    if text:
        engine = "client"
    elif audio:
        text, engine = local_stt(audio, filename or "audio.wav")

    if not text:
        return SpeechResult(
            ok=False,
            stt_engine=engine,
            message=(
                "没有获取到可用的语音文字。请在浏览器中开启麦克风识别，"
                "或直接用文字描述你的财务情况。"
            ),
        )

    analysis = analyze_text(text)
    return SpeechResult(
        ok=True,
        transcript=text[:5000],
        stt_engine=engine,
        analysis=analysis,
        entities=analysis.entities or [],
        summary=analysis.summary,
    )
