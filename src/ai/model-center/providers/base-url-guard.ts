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
const FORBIDDEN_V4 = [/^0\./, /^169\.254\./, /^224\./, /^240\./, /^255\./];

/** 解析 IPv6 为 128 位大整数（含内嵌 IPv4 与压缩形式），非法输入返回 null。 */
const B16 = BigInt(16);
const B32 = BigInt(32);
const B96 = BigInt(96);
const B112 = BigInt(112);
const MASK32 = BigInt(0xffffffff);
const V4_MAPPED_PREFIX = BigInt(0xffff);
const LOOPBACK6 = BigInt(1);
const UNSET6 = BigInt(0);
const ULA6 = BigInt(0xfc00) << B112;
const LINK_LOCAL6 = BigInt(0xfe80) << B112;
const SITE_LOCAL6 = BigInt(0xfec0) << B112;
const MULTICAST6 = BigInt(0xff00) << B112;
const IMDS6 = (BigInt(0xfd000ec2) << B96) + BigInt(0x254);

function parseIpv6(ip: string): bigint | null {
  if (isIP(ip) !== 6) return null;
  const zoneIndex = ip.indexOf("%");
  const addr = zoneIndex >= 0 ? ip.slice(0, zoneIndex) : ip;
  const parts = addr.split("::");
  if (parts.length > 2) return null;
  const expand = (segment: string): string[] =>
    segment
      ? segment.split(":").flatMap((group) => {
          if (group.includes(".")) {
            const octets = group.split(".").map(Number);
            if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return [];
            return [((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)];
          }
          return [group];
        })
      : [];
  const head = expand(parts[0]);
  const tail = parts.length === 2 ? expand(parts[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  let value = BigInt(0);
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << B16) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** 从 IPv4 映射/兼容的 IPv6 中提取内嵌 IPv4；非此类地址返回 null。 */
function embeddedV4(value: bigint): string | null {
  if (value >> B32 === V4_MAPPED_PREFIX || (value >> B32 === UNSET6 && value > LOOPBACK6)) {
    const n = Number(value & MASK32);
    return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
  }
  return null;
}

function inV6Subnet(value: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return value >> shift === base >> shift;
}

function isPrivateV4(ip: string): boolean {
  return PRIVATE_V4.some((re) => re.test(ip));
}

function isForbiddenV4(ip: string): boolean {
  return FORBIDDEN_V4.some((re) => re.test(ip));
}

function isPrivateIp(ip: string): boolean {
  const value = parseIpv6(ip);
  if (value !== null) {
    const mapped = embeddedV4(value);
    if (mapped) return isPrivateV4(mapped);
    return value === LOOPBACK6 || inV6Subnet(value, ULA6, 7) || inV6Subnet(value, LINK_LOCAL6, 10);
  }
  if (isIP(ip) === 4) return isPrivateV4(ip);
  return false;
}

function isAlwaysForbidden(ip: string): boolean {
  const value = parseIpv6(ip);
  if (value !== null) {
    const mapped = embeddedV4(value);
    if (mapped) return isForbiddenV4(mapped);
    return (
      value === UNSET6 ||
      inV6Subnet(value, LINK_LOCAL6, 10) ||
      inV6Subnet(value, SITE_LOCAL6, 10) ||
      inV6Subnet(value, MULTICAST6, 8) ||
      value === IMDS6
    );
  }
  if (isIP(ip) === 4) return isForbiddenV4(ip);
  return false;
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
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const allowPrivate = allowPrivateEndpoints();

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
      throw new UnsafeBaseUrlError(
        "生产环境默认禁止指向本机/内网的模型地址；如为自托管服务请设置 FINOS_ALLOW_PRIVATE_AI_ENDPOINTS=true"
      );
    }
  }
  return trimmed;
}
