import { NextResponse } from "next/server";

import { UnsafeBaseUrlError } from "../providers/base-url-guard";
import { ModelStoreDecryptError } from "./store";

type Handler<Args extends unknown[]> = (...args: Args) => Promise<NextResponse>;

/**
 * 包装模型中心路由处理器：密文存在但无法解密时返回 503 并说明原因，
 * 而不是把解密失败当空库继续写（那会清空用户全部模型配置）。
 */
export function withModelStoreErrors<Args extends unknown[]>(
  handler: Handler<Args>
): Handler<Args> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ModelStoreDecryptError) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      if (error instanceof UnsafeBaseUrlError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  };
}
