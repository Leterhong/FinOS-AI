import "server-only";

/**
 * 模型 Base URL 出站边界（与 backend/security/network.py 的
 * validate_model_endpoint_url 保持同一策略）：
 *
 *  - 仅允许 HTTP/HTTPS，且地址中不能内嵌用户名/密码；
 *  - 云元数据所在的链路本地段（169.254.0.0/16、fe80::/10）、未指定地址、
 *    组播/保留段在任何模式下都禁止；
 *  - 本机/内网地址（自托管 Ollama 等场景）默认仅在开发环境放行，
 *    生产环境需显式设置 FINOS_ALLOW_PRIVATE_AI_ENDPOINTS=true。
 */

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export class UnsafeBaseUrlError extends Error {}

const PRIVATE_V4 = [/^10\./, /^127\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith("::ffff:")) return isPrivateIp(ip.slice(7));
  if (isIP(ip) === 6) {
    const lowered = ip.toLowerCase();
    return (
      lowered === "::1" ||
      lowered.startsWith("fc") ||
      lowered.startsWith("fd") ||
      lowered.startsWith("fe80")
    );
  }
  return PRIVATE_V4.some((re) => re.test(ip));
}

function isAlwaysForbidden(ip: string): boolean {
  if (ip.startsWith("::ffff:")) return isAlwaysForbidden(ip.slice(7));
  if (isIP(ip) === 6) {
    const lowered = ip.toLowerCase();
    return lowered === "::" || lowered.startsWith("fe80") || lowered.startsWith("169.254") || lowered.startsWith("fec0");
  }
  // 169.254/16 链路本地（含云元数据）、0.0.0.0、组播与保留段。
  return (
    ip === "0.0.0.0" ||
    ip.startsWith("169.254.") ||
    ip.startsWith("224.") ||
    ip.startsWith("240.") ||
    ip.startsWith("255.")
  );
}

function allowPrivateEndpoints(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.FINOS_ALLOW_PRIVATE_AI_ENDPOINTS === "true";
}

/** 校验并归一化用户配置的模型 Base URL（去除末尾斜杠）。 */
export async function assertSafeBaseUrl(rawUrl: string): Promise<string> {
  const trimmed = (rawUrl || "").trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new UnsafeBaseUrlError("模型接口地址不是合法 URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeBaseUrlError("模型接口地址仅支持 HTTP/HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new UnsafeBaseUrlError("模型接口地址不能包含用户名或密码");
  }
  const host = parsed.hostname;
  let allowPrivate = allowPrivateEndpoints();

  if (isIP(host)) {
    if (isAlwaysForbidden(host)) {
      throw new UnsafeBaseUrlError("模型接口地址不允许指向链路本地/云元数据地址");
    }
    if (isPrivateIp(host) && !allowPrivate) {
      throw new UnsafeBaseUrlError(
        "生产环境默认禁止指向本机/内网的模型地址；如为自托管服务请设置 FINOS_ALLOW_PRIVATE_AI_ENDPOINTS=true"
      );
    }
    return trimmed;
  }

  let addresses: string[];
  try {
    const results = await lookup(host, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    throw new UnsafeBaseUrlError("模型接口地址的域名无法解析");
  }
  if (addresses.length === 0) {
    throw new UnsafeBaseUrlError("模型接口地址未解析到有效地址");
  }
  for (const address of addresses) {
    if (isAlwaysForbidden(address)) {
      throw new UnsafeBaseUrlError("模型接口地址不允许指向链路本地/云元数据地址");
    }
    if (isPrivateIp(address) && !allowPrivate) {
      allowPrivate = false;
      throw new UnsafeBaseUrlError(
        "生产环境默认禁止指向本机/内网的模型地址；如为自托管服务请设置 FINOS_ALLOW_PRIVATE_AI_ENDPOINTS=true"
      );
    }
  }
  return trimmed;
}
