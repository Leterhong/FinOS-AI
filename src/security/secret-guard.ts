import "server-only";

/**
 * 生产环境密钥守卫（共享）。
 *
 * 只检查「缺失」不足以拦截占位值：.env.example 里的
 * CHANGE_ME_..._AT_LEAST_32_BYTES_LONG 之类模板值长度足够，
 * 却是公开已知的字符串——抄进生产等于用公共密钥加密数据。
 */

const DEV_FALLBACK_MARKERS = ["change_me", "change-me", "changeme", "placeholder", "your-"];

const MIN_SECRET_LENGTH = 32;

/** 是否为公开已知的占位密钥（长度不限）。 */
export function isPlaceholderSecret(value: string): boolean {
  const lowered = value.toLowerCase();
  return DEV_FALLBACK_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * 生产环境强制校验；开发环境放行但允许调用方提示。
 * 返回实际应使用的 secret（生产通过则一定是强值）。
 */
export function resolveSecretOrThrow(
  raw: string | undefined,
  module: string,
  devFallback: string,
): string {
  const value = (raw || "").trim();
  if (!value || isPlaceholderSecret(value)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `[${module}] 生产环境必须配置高熵随机密钥（缺失或占位值均拒绝）。` +
          "生成方式：node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
      );
    }
    return devFallback;
  }
  if (value.length < MIN_SECRET_LENGTH) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `[${module}] 密钥强度不足：至少 ${MIN_SECRET_LENGTH} 个字符，拒绝在生产环境启动。`
      );
    }
  }
  return value;
}
