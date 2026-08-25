import http from "k6/http";
import { check } from "k6";
import { config } from "../config.js";
import { bearerHeaders } from "./auth.js";
import { rpcErrors } from "./metrics.js";

function unwrapRpcPayload(responseBody) {
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
      const err = value.error;
      const message =
        typeof err.message === "string" ? err.message : JSON.stringify(err);
      const code = err.code != null ? Number(err.code) : 0;
      throw new Error(`RPC error (${code}): ${message}`);
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
        return JSON.parse(trimmed);
      } catch (_e) {
        return value;
      }
    }
  }

  return value;
}

/**
 * TV-style RPC call: JSON-string body first, plain object fallback.
 * Matches just_for_hesam callTvRpc behavior.
 */
export function callRpc(token, rpcName, payload, tags) {
  const urlBase = `${config.httpBase}/v2/rpc/${rpcName}`;
  const query = config.httpKey ? `?http_key=${encodeURIComponent(config.httpKey)}&unwrap` : "?unwrap";
  const url = urlBase + query;
  const headers = bearerHeaders(token);
  const bodyObject = payload || {};

  // Nakama RPC expects JSON object body (single-encoded)
  let res = http.post(url, JSON.stringify(bodyObject), {
    headers,
    timeout: config.httpTimeout,
    tags: Object.assign({ rpc: rpcName }, tags || {}),
  });

  if (res.status === 400 || res.status === 500) {
    res = http.post(url, JSON.stringify(JSON.stringify(bodyObject)), {
      headers,
      timeout: config.httpTimeout,
      tags: Object.assign({ rpc: rpcName, fallback: "string" }, tags || {}),
    });
  }

  const ok = res.status === 200;
  let parsed = null;
  let error = null;

  if (ok) {
    try {
      parsed = unwrapRpcPayload(JSON.parse(res.body));
    } catch (e) {
      error = e.message || String(e);
    }
  } else {
    error = `HTTP ${res.status}: ${(res.body || "").slice(0, 200)}`;
    rpcErrors.add(1);
  }

  if (ok && error) {
    rpcErrors.add(1);
  }

  return { ok, status: res.status, parsed, error, body: res.body, timings: res.timings };
}

export function callRpcChecked(token, rpcName, payload, checkName, tags) {
  const result = callRpc(token, rpcName, payload, tags);
  check(result, {
    [checkName]: (r) => r.ok && r.parsed != null && !r.error,
  });
  return result;
}

/** Fetch first video id from catalog when VIDEO_ID is not configured. */
export function fetchDefaultVideoId(token) {
  if (config.videoId > 0) {
    return { ok: true, videoId: config.videoId };
  }

  const list = callRpc(token, "rpc_video_getPublicVideoList", {
    limit: 10,
    offset: 0,
  });

  if (!list.ok || !list.parsed) {
    return { ok: false, videoId: 1, error: list.error || "video list failed" };
  }

  let videos = list.parsed;
  if (videos && videos.result && Array.isArray(videos.result)) {
    videos = videos.result;
  }
  if (videos && videos.videos && Array.isArray(videos.videos)) {
    videos = videos.videos;
  }
  if (!Array.isArray(videos)) {
    videos = [];
  }

  for (let i = 0; i < videos.length; i++) {
    const item = videos[i];
    const id = Number(item.id != null ? item.id : item.videoId);
    if (Number.isFinite(id) && id > 0) {
      return { ok: true, videoId: id };
    }
  }

  return { ok: false, videoId: 1, error: "no videos in catalog" };
}

export function getFrameSyncMonitor(token) {
  return callRpc(token, "rpc_getFrameSyncMonitor", {});
}

export function getServerTimeRpc(token) {
  return callRpc(token, "rpc_getServerTime", {});
}
