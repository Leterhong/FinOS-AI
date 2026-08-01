"""多模态输入层常量（Phase 7.2 需求一/二/十五/十八）。"""
from __future__ import annotations

DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"
WELCOME_MESSAGE = "欢迎创建你的财富数字分身"

# ---- 模态 ----
MODALITY_TEXT = "text"
MODALITY_IMAGE = "image"
MODALITY_AUDIO = "audio"
MODALITY_DOCUMENT = "document"
MODALITIES = (MODALITY_TEXT, MODALITY_IMAGE, MODALITY_AUDIO, MODALITY_DOCUMENT)

# ---- 扩展名 → 模态（需求二：自动判断输入类型） ----
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".heic"}
AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".webm", ".flac", ".amr"}
DOCUMENT_EXTS = {
    ".pdf", ".csv", ".tsv", ".txt", ".md", ".json",
    ".xlsx", ".xls", ".docx", ".doc", ".html", ".htm",
}

# ---- 上传限制（需求十八：安全） ----
MAX_IMAGE_BYTES = 8 * 1024 * 1024      # 8MB
MAX_AUDIO_BYTES = 20 * 1024 * 1024     # 20MB
MAX_DOCUMENT_BYTES = 15 * 1024 * 1024  # 15MB
MAX_TEXT_CHARS = 20_000

MAX_BYTES_BY_MODALITY = {
    MODALITY_IMAGE: MAX_IMAGE_BYTES,
    MODALITY_AUDIO: MAX_AUDIO_BYTES,
    MODALITY_DOCUMENT: MAX_DOCUMENT_BYTES,
}

# ---- 提取结果类型（需求四：一律先 needs_confirm） ----
KIND_ASSET = "asset"
KIND_LIABILITY = "liability"
KIND_INCOME = "income"
KIND_EXPENSE = "expense"
KIND_GOAL = "goal"
KIND_PROFILE = "profile"
KIND_TRANSACTION = "transaction"
EXTRACTION_KINDS = (
    KIND_ASSET, KIND_LIABILITY, KIND_INCOME,
    KIND_EXPENSE, KIND_GOAL, KIND_PROFILE, KIND_TRANSACTION,
)

STATUS_NEEDS_CONFIRM = "needs_confirm"
STATUS_CONFIRMED = "confirmed"
STATUS_REJECTED = "rejected"

# ---- 资产类型词典（与 intelligence.constants 同口径） ----
ASSET_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "cash": ("现金", "活期", "存款", "余额宝", "银行卡", "储蓄", "货币基金", "零钱"),
    "stock": ("股票", "持仓", "A股", "港股", "美股", "证券", "股份", "个股"),
    "fund": ("基金", "ETF", "指数基金", "定投", "混合型", "债券型基金"),
    "bond": ("债券", "国债", "企业债", "可转债"),
    "property": ("房产", "住宅", "房屋", "不动产", "商铺", "车位"),
    "crypto": ("比特币", "以太坊", "BTC", "ETH", "数字货币", "加密货币"),
    "gold": ("黄金", "金条", "贵金属", "白银"),
    "insurance": ("保险", "重疾险", "医疗险", "寿险", "年金险", "保单"),
    "pension": ("养老金", "社保", "公积金", "企业年金"),
    "liability": ("负债", "贷款", "房贷", "车贷", "信用卡欠款", "借款", "花呗", "白条"),
}

# 截图类型识别（需求三：识别股票/基金/银行流水/资产/保险截图）
SCREENSHOT_HINTS: dict[str, tuple[str, ...]] = {
    "stock_holding": ("持仓", "市值", "盈亏", "成本价", "股票", "证券账户"),
    "fund_holding": ("基金", "净值", "份额", "累计收益", "定投"),
    "bank_statement": ("交易明细", "银行流水", "收入", "支出", "账户余额", "对账单"),
    "insurance_policy": ("保单", "保额", "保费", "受益人", "保障期间"),
    "asset_overview": ("总资产", "净资产", "资产配置", "总市值"),
}

# ---- 成本控制（需求十五） ----
VISION_CACHE_TTL = 24 * 3600     # 同一张图 24 小时内不重复识别
EXTRACT_CACHE_TTL = 6 * 3600
VISION_MAX_TOKENS = 700
VISION_IMAGE_MAX_EDGE = 1280     # 调用 LLM 前压缩长边
VISION_IMAGE_QUALITY = 72
# 本地规则命中足够多的实体时，不再调用 LLM（简单 OCR 不调 LLM）
LOCAL_ENOUGH_ENTITIES = 3

TIER_LOCAL = "local"
TIER_OCR = "ocr"
TIER_AI = "ai"
