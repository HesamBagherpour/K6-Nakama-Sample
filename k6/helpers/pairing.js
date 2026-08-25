import { check } from "k6";
import { config } from "../config.js";
import { callRpc } from "./nakama.js";
import {
  pairingAttempts,
  pairingCompleteFailure,
  pairingCompleteSuccess,
  pairingDuration,
  pairingGenerateFailure,
  pairingGenerateSuccess,
  pairingSuccessRate,
  pairingVerifyFailure,
  pairingVerifySuccess,
} from "./metrics.js";
import { failSession } from "./session.js";

/** NOTIFICATION_CODES from notificationCodes.ts */
export const NOTIFICATION_CODES = {
  Ping: 2,
  Pong: 3,
  ReceiveAcceptedLinkLoginCode: 4,
  WaitingForVideoPlayReady: 6,
  OnPlayerTotalScoreChanged: 8,
  VideoDownloadIntent: 9,
  VideoTvReady: 10,
  VideoUnityReady: 11,
  VideoSyncStart: 12,
  OnDanceVideoFinished: 13,
  ReturnToSongList: 14,
  FrameSync: 16,
  SessionEnded: 17,
};

function rpcFailDetails(rpcName, result, extra) {
  return Object.assign(
    {
      rpc: rpcName,
      status: result ? result.status : null,
      code: result && result.errorCode != null ? result.errorCode : null,
      message: result && result.error ? result.error : "",
      body: result && result.body != null ? result.body : "",
    },
    extra || {},
  );
}

export function generateLinkLoginCode(tvToken, tvLinkDeviceId) {
  const start = Date.now();
  const payload = { deviceId: String(tvLinkDeviceId) };
  const result = callRpc(
    tvToken,
    "rpc_multiSession_generateLinkLoginCode",
    payload,
    { phase: "pairing" },
  );
  pairingDuration.add(Date.now() - start);

  const loginCode = extractLoginCode(result.parsed);
  const ok = check(result, {
    "pairing generate code ok": (r) => r.ok && r.parsed != null,
    "pairing loginCode present": () => loginCode != null,
  });

  if (!ok) {
    pairingGenerateFailure.add(1);
    return {
      ok: false,
      loginCode: null,
      result,
      error: result.error || "generate failed",
    };
  }

  pairingGenerateSuccess.add(1);
  return {
    ok: true,
    loginCode,
    expiresAt: extractExpiresAt(result.parsed),
    result,
  };
}

function extractLoginCode(parsed) {
  if (!parsed) return null;
  const sources = [parsed];
  if (parsed.result) sources.push(parsed.result);
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const raw = src.loginCode != null ? src.loginCode : src.login_code;
    if (raw == null) continue;
    const text = String(raw).trim();
    if (/^\d{6}$/.test(text)) return text;
    if (Number.isFinite(Number(raw))) {
      const asText = String(Math.trunc(Number(raw)));
      if (/^\d{6}$/.test(asText)) return asText;
    }
  }
  return null;
}

function extractExpiresAt(parsed) {
  if (!parsed) return 0;
  const sources = [parsed];
  if (parsed.result) sources.push(parsed.result);
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const raw = src.expiresAt != null ? src.expiresAt : src.expires_at;
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  }
  return 0;
}

/**
 * Production QR payload (PairingScreen.tsx):
 *   JSON.stringify({ deviceId: linkDeviceId, loginCode })
 * Unity/mobile then POSTs the same fields to verifyAndAccept.
 *
 * Server parse:
 *   loginCode → Number(parsed.loginCode)
 *   deviceId  → String(parsed.deviceId)  (optional; looked up from code index if omitted)
 */
export function verifyAndAcceptLinkLoginCode(mobileToken, loginCode, tvLinkDeviceId) {
  const payload = {
    loginCode: Number(loginCode),
    deviceId: String(tvLinkDeviceId),
  };
  const result = callRpc(
    mobileToken,
    "rpc_multiSession_verifyAndAcceptLinkLoginCode",
    payload,
    { phase: "pairing" },
  );

  const ok = check(result, {
    "pairing verify ok": (r) => r.ok,
    "pairing verify success": (r) => {
      if (!r.ok || !r.parsed) return false;
      if (r.parsed.success === true) return true;
      if (r.parsed.result && r.parsed.result.success === true) return true;
      if (r.parsed.linkLoginCode != null) return true;
      return false;
    },
  });

  if (!ok) {
    pairingVerifyFailure.add(1);
    return { ok: false, result, error: result.error || "verify failed", payload };
  }

  pairingVerifySuccess.add(1);
  return { ok: true, parsed: result.parsed, result, payload };
}

export function sendNotification(token, subject, code, content) {
  return callRpc(token, "rpc_multiSession_sendNotificationToSessions", {
    subject,
    code,
    content: content || {},
  });
}

export function unlinkDevice(token, deviceId) {
  return callRpc(token, "rpc_multiSession_unlinkDevice", { deviceId });
}

/**
 * Complete pairing = generate OK + verify OK + (optional) WS confirmation.
 * Individual RPC counters are updated in the helpers above.
 */
export function runPairingFlow(tvAuth, mobileAuths, linkDeviceId, life) {
  pairingAttempts.add(1);

  const deviceId = linkDeviceId || tvAuth.linkDeviceId || tvAuth.deviceId;
  const generated = generateLinkLoginCode(tvAuth.token, deviceId);
  if (life) life.loginCode = generated.loginCode;

  if (!generated.ok) {
    pairingCompleteFailure.add(1);
    pairingSuccessRate.add(false);
    if (life) {
      failSession(
        life,
        rpcFailDetails(
          "rpc_multiSession_generateLinkLoginCode",
          generated.result,
          { loginCode: generated.loginCode },
        ),
      );
    }
    return { ok: false, stage: "generate", error: generated.error, result: generated.result };
  }

  for (let i = 0; i < mobileAuths.length; i++) {
    const mobile = mobileAuths[i];
    const verified = verifyAndAcceptLinkLoginCode(
      mobile.token,
      generated.loginCode,
      deviceId,
    );
    if (!verified.ok) {
      pairingCompleteFailure.add(1);
      pairingSuccessRate.add(false);
      if (life) {
        failSession(
          life,
          rpcFailDetails(
            "rpc_multiSession_verifyAndAcceptLinkLoginCode",
            verified.result,
            { loginCode: generated.loginCode },
          ),
        );
      }
      return {
        ok: false,
        stage: "verify",
        playerIndex: i,
        error: verified.error,
        result: verified.result,
        payload: verified.payload,
        loginCode: generated.loginCode,
      };
    }
  }

  pairingCompleteSuccess.add(1);
  pairingSuccessRate.add(true);
  return { ok: true, loginCode: generated.loginCode };
}

export function sendVideoSelectionFlow(tvToken, tvSubject, videoId, playerCount) {
  const steps = [
    {
      code: NOTIFICATION_CODES.VideoDownloadIntent,
      content: { videoId: videoId },
    },
    {
      code: NOTIFICATION_CODES.WaitingForVideoPlayReady,
      content: { playerCount: playerCount },
    },
    {
      code: NOTIFICATION_CODES.VideoTvReady,
      content: { videoId: videoId },
    },
  ];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const res = sendNotification(tvToken, tvSubject, step.code, step.content);
    if (!res.ok) {
      return { ok: false, step: i, error: res.error || "notification failed", result: res };
    }
  }

  return { ok: true };
}

export function sendMobileVideoUnityReady(mobileToken, mobileSubject, videoId) {
  return sendNotification(mobileToken, mobileSubject, NOTIFICATION_CODES.VideoUnityReady, {
    videoId: videoId,
  });
}

export function sendSessionEnded(tvToken, tvSubject, reason) {
  if (config.skipCleanup) return { ok: true, skipped: true };
  return sendNotification(tvToken, tvSubject, NOTIFICATION_CODES.SessionEnded, {
    reason: reason || "k6-test-complete",
    timestamp: Date.now(),
    source: "tv",
  });
}
