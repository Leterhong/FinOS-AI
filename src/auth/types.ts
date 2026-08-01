/**
 * 用户认证类型定义（Phase 5.6）。
 * 纯类型文件，可被客户端与服务端共同引用。
 */

/** 账户存储记录（含敏感字段，仅服务端读写）。 */
export interface UserAccount {
  /** 用户唯一 ID，同时作为所有业务数据的 userId 分区键。 */
  id: string;
  /** 登录邮箱（小写、去空白后唯一）。 */
  email: string;
  /** 显示名称（Onboarding 前默认取邮箱前缀）。 */
  name: string;
  /** scrypt 派生的密码哈希（hex）。 */
  passwordHash: string;
  /** 每用户独立随机盐（hex）。 */
  passwordSalt: string;
  /** 头像 URL（data URL 或 /api/auth/avatar/{id}），可空。 */
  avatarUrl?: string;
  /** 是否已通过财富初始化引导完成个人财富画像（Phase 5.8）。 */
  profileCompleted: boolean;
  /** 创建时间（epoch ms）。 */
  createdAt: number;
  /** 最近更新时间（epoch ms）。 */
  updatedAt: number;
}

/** 对外暴露的安全用户视图（不含任何密码字段）。 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  /** 是否已通过财富初始化引导完成个人财富画像（Phase 5.8）。 */
  profileCompleted: boolean;
  createdAt: number;
}

/** Session Token 载荷（HMAC 签名后写入 cookie）。 */
export interface SessionPayload {
  userId: string;
  email: string;
  /** 签发时间（epoch ms）。 */
  iat: number;
  /** 过期时间（epoch ms）。 */
  exp: number;
}

/** 注册入参。 */
export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

/** 登录入参。 */
export interface LoginInput {
  email: string;
  password: string;
}

/** 认证结果统一返回体。 */
export interface AuthResult {
  ok: boolean;
  user?: PublicUser;
  error?: string;
}
