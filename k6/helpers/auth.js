import http from "k6/http";
import encoding from "k6/encoding";
import { check } from "k6";
import { config } from "../config.js";
import {
  authDuration,
  authFailure,
  authSuccess,
} from "./metrics.js";

const authHeader =
  "Basic " + encoding.b64encode(`${config.serverKey}:`);

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: authHeader,
  };
}

/**
 * POST /v2/account/authenticate/device?create=true
 * @param {"tv"|"mobile"} role
 * @param {string} deviceId — must be unique and stable for this session
 */
export function authenticateDevice(role, deviceId) {
  const url = `${config.httpBase}/v2/account/authenticate/device?create=true`;
  const body = JSON.stringify({ id: deviceId, vars: {} });
  const start = Date.now();

  const res = http.post(url, body, {
    headers: authHeaders(),
    timeout: config.httpTimeout,
    tags: { rpc: "authenticate_device", role: role },
  });

  authDuration.add(Date.now() - start);

  const ok = check(res, {
    "auth status 200": (r) => r.status === 200,
    "auth has token": (r) => {
      try {
        const parsed = JSON.parse(r.body);
        return !!parsed.token;
      } catch (_e) {
        return false;
      }
    },
  });

  if (!ok) {
    authFailure.add(1);
    return { ok: false, deviceId, token: null, userId: null, body: res.body };
  }

  authSuccess.add(1);
  const parsed = JSON.parse(res.body);
  return {
    ok: true,
    deviceId,
    token: parsed.token,
    userId: parsed.user_id || parsed.userId || null,
    refreshToken: parsed.refresh_token || null,
    username: parsed.username || null,
    raw: parsed,
  };
}

export function bearerHeaders(token) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}
