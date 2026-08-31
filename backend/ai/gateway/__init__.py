from .provider import GatewayError, embed, generate, generate_sync, stream, test_connection

PUBLIC_GATEWAY_ERROR = "AI 模型服务暂时不可用，请检查模型配置或稍后重试"

__all__ = [
    "GatewayError",
    "PUBLIC_GATEWAY_ERROR",
    "embed",
    "generate",
    "generate_sync",
    "stream",
    "test_connection",
]
