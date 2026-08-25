import { check } from "k6";
import { config } from "../config.js";
import { callRpc } from "./nakama.js";
import {
  pairingDuration,
  pairingFailure,
  pairingSuccess,
  pairingSuccessRate,
} from "./metrics.js";

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

export function generateLinkLoginCode(tvToken, tvDeviceId) {
  const start = Date.now();
  const result = callRpc(
    tvToken,
    "rpc_multiSession_generateLinkLoginCode",
    { deviceId: tvDeviceId },
    { phase: "pairing" },
  );
  pairingDuration.add(Date.now() - start);

  const ok = check(result, {
    "pairing generate code ok": (r) => r.ok && r.parsed != null,
    "pairing loginCode present": (r) => {
      const code = extractLoginCode(r.parsed);
      return code != null;
    },
  });

  if (!ok) {
    pairingFailure.add(1);
    pairingSuccessRate.add(false);
    return { ok: false, loginCode: null, error: result.error || "generate failed" };
  }

  const loginCode = extractLoginCode(result.parsed);
  pairingSuccess.add(1);
  pairingSuccessRate.add(true);
  return { ok: true, loginCode, expiresAt: extractExpiresAt(result.parsed) };
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
    if (Number.isFinite(Number(raw))) return String(Math.trunc(Number(raw)));
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

export function verifyAndAcceptLinkLoginCode(mobileToken, loginCode, tvDeviceId) {
  const payload = {
    loginCode: loginCode,
    deviceId: tvDeviceId,
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
      if (!r.parsed) return false;
      if (r.parsed.success === true) return true;
      if (r.parsed.result && r.parsed.result.success === true) return true;
      if (r.parsed.linkLoginCode != null) return true;
      return r.ok;
    },
  });

  if (!ok) {
    pairingFailure.add(1);
    pairingSuccessRate.add(false);
    return { ok: false, error: result.error || "verify failed" };
  }

  pairingSuccess.add(1);
  pairingSuccessRate.add(true);
  return { ok: true, parsed: result.parsed };
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

export function runPairingFlow(tvAuth, mobileAuths, linkDeviceId) {
  const deviceId = linkDeviceId || tvAuth.linkDeviceId || tvAuth.deviceId;
  const generated = generateLinkLoginCode(tvAuth.token, deviceId);
  if (!generated.ok) {
    return { ok: false, stage: "generate", error: generated.error };
  }

  for (let i = 0; i < mobileAuths.length; i++) {
    const mobile = mobileAuths[i];
    const verified = verifyAndAcceptLinkLoginCode(
      mobile.token,
      generated.loginCode,
      deviceId,
    );
    if (!verified.ok) {
      return {
        ok: false,
        stage: "verify",
        playerIndex: i,
        error: verified.error,
      };
    }
  }

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
      return { ok: false, step: i, error: res.error || "notification failed" };
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
