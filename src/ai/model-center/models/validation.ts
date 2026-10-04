/**
 * 模型配置字段长度边界。
 *
 * 服务端在落库前统一校验，避免任意长度的字符串被加密写入配置文件，
 * 既防止单个配置膨胀，也避免前端校验被绕过。上限按真实字段用途设定：
 *  - modelId / displayName / modelName：标识与展示名
 *  - baseUrl：合法 URL 长度
 *  - apiKey：超长密钥（部分自建网关会携带较长 token）
 */

export class ModelConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigValidationError";
  }
}

export const MODEL_FIELD_MAX_LENGTHS = {
  modelId: 200,
  displayName: 200,
  modelName: 200,
  baseUrl: 2048,
  apiKey: 8192,
} as const;

export type ModelField = keyof typeof MODEL_FIELD_MAX_LENGTHS;

/** 逐字段校验长度；非字符串值忽略（类型转换由调用方的 coerce 负责）。 */
export function assertModelFieldLengths(input: Partial<Record<ModelField, unknown>>): void {
  for (const [field, max] of Object.entries(MODEL_FIELD_MAX_LENGTHS) as [ModelField, number][]) {
    const value = input[field];
    if (typeof value === "string" && value.length > max) {
      throw new ModelConfigValidationError(`${field} 长度不能超过 ${max} 个字符`);
    }
  }
}
