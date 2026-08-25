import { sleep } from "k6";
import { config } from "../config.js";
import { authenticateDevice } from "../helpers/auth.js";
import { connectNakamaWebSocket } from "../helpers/websocket.js";
import { runPairingFlow } from "../helpers/pairing.js";
import { runFullGameSession } from "./gameplay.js";
import { createSessionContext, jitterMs as randomJitter } from "../helpers/utils.js";

/** SCENARIO 1 — auth + websocket stability only */
export function runConnectionScenario(vu, iter) {
  sleep(randomJitter(config.jitterAuthMaxMs) / 1000);

  const session = createSessionContext(vu, iter);
  const auth = authenticateDevice("mobile", session.mobileDeviceId);
  if (!auth.ok) return { ok: false, stage: "auth" };

  const ws = connectNakamaWebSocket({
    token: auth.token,
    durationMs: 30000,
  });

  return { ok: ws.connected, stage: ws.connected ? "complete" : "websocket" };
}

/** SCENARIO 3 — score stress (full 1:1 session with configurable score interval) */
export function runScoreStressScenario(vu, iter) {
  return runFullGameSession(vu, iter);
}

/** SCENARIO 4 — frame sync stress */
export function runFrameSyncStressScenario(vu, iter) {
  return runFullGameSession(vu, iter);
}

/** Pairing-only quick path for diagnostics */
export function runPairingOnlyScenario(vu, iter) {
  const session = createSessionContext(vu, iter);
  const tv = authenticateDevice("tv", session.tvAuthDeviceId);
  if (!tv.ok) return { ok: false, stage: "tv_auth" };
  tv.linkDeviceId = session.tvLinkDeviceId;
  const mobile = authenticateDevice("mobile", session.mobileDeviceId);
  if (!mobile.ok) return { ok: false, stage: "mobile_auth" };
  const pairing = runPairingFlow(tv, [mobile], session.tvLinkDeviceId);
  return { ok: pairing.ok, stage: "pairing", pairing };
}
