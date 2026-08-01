/**
 * auth 模块桶文件（Phase 5.6）。
 *
 * 注意：仅在此导出「客户端安全」的类型。
 * crypto / store / session 均标记 server-only，请在服务端代码中按需直接引入：
 *   import { userAccountStore, toPublicUser } from "@/auth/store";
 *   import { getSessionUserId, setSession, clearSession } from "@/auth/session";
 *   import { verifyPassword, hashPassword } from "@/auth/crypto";
 */

export type {
  UserAccount,
  PublicUser,
  SessionPayload,
  RegisterInput,
  LoginInput,
  AuthResult,
} from "./types";
