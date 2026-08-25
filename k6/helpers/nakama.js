import http from "k6/http";
import { check } from "k6";
import { config } from "../config.js";
import { bearerHeaders } from "./auth.js";
import { leaderboardErrors, rpcErrors } from "./metrics.js";
import { extractRpcError, unwrapRpcPayload } from "./rpcParse.js";

const BLOCKED_LEADERBOARD_RPCS = {
  rpc_dance_submitSessionResults: true,
};

function isBlockedLeaderboardRpc(rpcName) {
  const name = String(rpcName || "");
  return !!BLOCKED_LEADERBOARD_RPCS[name] || /leaderboard/i.test(name);
}

/**
 * TV-style RPC call: JSON-string body first, plain object fallback.
 * Matches just_for_hesam callTvRpc behavior.
 *
 * Leaderboard RPCs are blocked in this load-test phase.
 */
export function callRpc(token, rpcName, payload, tags) {
  if (isBlockedLeaderboardRpc(rpcName)) {
    leaderboardErrors.add(1);
    console.error(
      `BUG: k6 load test must not call leaderboard RPC: ${rpcName}`,
    );
    return {
      ok: false,
      status: 0,
      parsed: null,
      error: `blocked leaderboard RPC: ${rpcName}`,
      errorCode: null,
      body: "",
      timings: null,
      rpcName,
      payload: payload || {},
    };
  }

  const urlBase = `${config.httpBase}/v2/rpc/${rpcName}`;
  // Production TV/mobile RPCs use Bearer only (just_for_hesam callTvRpc).
  // Do not send http_key here: that is server-to-server auth and can leave
  // ctx.userId empty, which makes nk.linkDevice fail with 4008.
  const url = `${urlBase}?unwrap=true`;
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

  const bizError = extractRpcError(res.body);
  const httpOk = res.status === 200;
  let parsed = null;
  let error = null;
  let errorCode = null;

  if (httpOk && !bizError) {
    try {
      parsed = unwrapRpcPayload(JSON.parse(res.body));
      if (parsed && typeof parsed === "object" && parsed.error) {
        const nested = extractRpcError(parsed);
        if (nested) {
          error = nested.message;
          errorCode = nested.code;
          parsed = null;
        }
      }
    } catch (e) {
      error = e.message || String(e);
    }
  } else if (bizError) {
    error = bizError.message;
    errorCode = bizError.code;
  } else {
    error = `HTTP ${res.status}: ${(res.body || "").slice(0, 500)}`;
  }

  const ok = httpOk && !error;
  if (ok && parsed == null) {
    parsed = {};
  }
  if (!ok) {
    rpcErrors.add(1);
  }

  return {
    ok,
    status: res.status,
    parsed,
    error,
    errorCode,
    body: res.body,
    timings: res.timings,
    rpcName,
    payload: bodyObject,
  };
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
