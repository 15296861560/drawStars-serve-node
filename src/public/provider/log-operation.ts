/** 操作日志语义类型（与前端筛选选项对齐） */
export const OP_TYPE = {
  INSERT: "insert",
  UPDATE: "update",
  DELETE: "delete",
  SELECT: "select",
  LOGIN: "login",
  LOGOUT: "logout",
  OTHER: "other",
} as const;

export type OpType = (typeof OP_TYPE)[keyof typeof OP_TYPE];

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

const OP_TYPE_SET = new Set<string>(Object.values(OP_TYPE));

/** 从路径 / 文本推断操作类型 */
export function inferOperationType(
  method: string,
  pathOrText: string,
): OpType {
  const hay = `${method} ${pathOrText}`.toLowerCase();

  if (/logout|signout|登出/.test(hay)) return OP_TYPE.LOGOUT;
  if (/login|signin|登录/.test(hay)) return OP_TYPE.LOGIN;
  if (
    /delete|remove|cancel|删除|移除/.test(hay) ||
    String(method).toUpperCase() === "DELETE"
  ) {
    return OP_TYPE.DELETE;
  }
  if (
    /update|modify|edit|bind|\/set|修改|更新/.test(hay) ||
    /^(PUT|PATCH)$/i.test(method)
  ) {
    return OP_TYPE.UPDATE;
  }
  if (
    /create|insert|add|register|\/save|新增|添加|注册/.test(hay)
  ) {
    return OP_TYPE.INSERT;
  }
  if (
    /query|list|select|search|\/find|\/get|查询|获取/.test(hay) ||
    String(method).toUpperCase() === "GET"
  ) {
    return OP_TYPE.SELECT;
  }

  // 无明确语义的 POST，归为其他（避免一律写成 insert）
  if (String(method).toUpperCase() === "POST") return OP_TYPE.OTHER;

  return OP_TYPE.OTHER;
}

/** 仅保留标准 HTTP 方法；业务函数名等返回空 */
export function normalizeHttpMethod(
  method: unknown,
  operation?: unknown,
): string {
  const m = method != null ? String(method).trim() : "";
  if (m && HTTP_METHODS.has(m.toUpperCase())) return m.toUpperCase();

  const op = operation != null ? String(operation).trim() : "";
  const fromOp = op.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i);
  if (fromOp) return fromOp[1].toUpperCase();

  return "";
}

/**
 * 规范化操作类型：
 * - 已是 insert/update/... 直接用
 * - 历史数据 operation 为 "POST /path" 或 method 为业务函数名时，从文本推断
 */
export function normalizeOperationType(
  content: {
    operation?: unknown;
    method?: unknown;
    path?: unknown;
    action?: unknown;
  },
  originalUrl?: string | null,
): OpType {
  const rawOp = content.operation != null ? String(content.operation).trim() : "";
  if (rawOp && OP_TYPE_SET.has(rawOp.toLowerCase())) {
    return rawOp.toLowerCase() as OpType;
  }

  const httpMethod = normalizeHttpMethod(content.method, content.operation);
  const path = String(
    content.path || originalUrl || rawOp || content.action || content.method || "",
  );
  const businessHint =
    httpMethod && String(content.method || "").toUpperCase() === httpMethod
      ? ""
      : String(content.method || content.action || "");

  return inferOperationType(httpMethod || "", `${path} ${businessHint} ${rawOp}`);
}
