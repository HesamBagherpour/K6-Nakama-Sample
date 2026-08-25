/**
 * Parse Nakama RPC HTTP bodies without throwing, so callers can log
 * status / code / message / raw body on failure.
 */
export function extractRpcError(value) {
  let current = value;
  if (typeof current === "string") {
    try {
      current = JSON.parse(current);
    } catch (_e) {
      return null;
    }
  }
  if (!current || typeof current !== "object") return null;

  if (current.error != null) {
    const err = current.error;
    if (typeof err === "string") {
      return { code: 0, message: err };
    }
    if (typeof err === "object") {
      return {
        code: err.code != null ? Number(err.code) : 0,
        message:
          typeof err.message === "string" ? err.message : JSON.stringify(err),
      };
    }
  }

  if ("payload" in current) return extractRpcError(current.payload);
  if ("result" in current) return extractRpcError(current.result);
  return null;
}

export function unwrapRpcPayload(responseBody) {
  let value = responseBody;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (_e) {
      return value;
    }
  }

  if (value && typeof value === "object") {
    if ("error" in value && value.error != null) {
      return value;
    }
    if ("payload" in value) {
      return unwrapRpcPayload(value.payload);
    }
    if ("result" in value) {
      return unwrapRpcPayload(value.result);
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return unwrapRpcPayload(JSON.parse(trimmed));
      } catch (_e) {
        return value;
      }
    }
  }

  return value;
}
