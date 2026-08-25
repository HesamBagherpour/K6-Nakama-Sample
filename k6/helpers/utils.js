/** @param {number} maxMs */
export function jitterMs(maxMs) {
  if (!maxMs || maxMs <= 0) return 0;
  return Math.floor(Math.random() * maxMs);
}

export function randomAlphaNum(length) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/**
 * One k6 VU = 1 TV + 1 mobile. All IDs for this session share sessionKey
 * but remain unique across VUs and never reused between TV/mobile roles.
 *
 * Production still requires TV *link* id format: /^tv-[a-z0-9]+-\d+$/i
 * Auth device id must differ from link device id (server error 4008).
 */
export function createSessionContext(vu, iter) {
  const sessionKey = `${vu}-${iter}-${Date.now()}-${randomAlphaNum(8)}`;
  const linkTimestamp = Date.now();

  return {
    sessionKey,
    /**
     * Authenticate/device only. Must NOT match LINK_DEVICE_ID_PATTERN
     * (/^tv-[a-z0-9]+-\d+$/i) and must never be sent as the pairing deviceId.
     * Production TV uses the shared guest id "tv-guest-link-notify" here;
     * each k6 VU needs a unique guest-style id so accounts do not collide.
     */
    tvAuthDeviceId: `k6-tv-auth-${sessionKey}`,
    /**
     * Pairing/link id — production createTvDeviceId(): tv-{random12}-{timestamp}
     * Never used for authenticate/device before verify (server 4008).
     */
    tvLinkDeviceId: `tv-${randomAlphaNum(12)}-${linkTimestamp}`,
    mobileDeviceId: `k6-mobile-${sessionKey}`,
    tvSubject: createNotificationSubject(sessionKey, "tv"),
    mobileSubject: createNotificationSubject(sessionKey, "mobile"),
  };
}

/** Per-client notification subject UUID (SendNotificationBaseReqModel.subject) */
export function createNotificationSubject(sessionKey, role) {
  const hex = "0123456789abcdef";
  let s = "";
  const seed = `${sessionKey}-${role}`;
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      s += "-";
    } else if (i === 14) {
      s += "4";
    } else if (i === 19) {
      s += hex[(Math.floor(Math.random() * 4) + 8) % 16];
    } else {
      s += hex[Math.floor(Math.random() * 16)];
    }
  }
  void seed;
  return s;
}

export function uniqueSessionId(prefix, vu, iter) {
  return `${prefix}-${vu}-${iter}-${Date.now()}-${randomAlphaNum(6)}`;
}

/**
 * Realistic rising score curve for ~60s gameplay.
 * @param {number} elapsedSec
 */
export function generateLiveScore(elapsedSec) {
  const rate = 850 + Math.random() * 350;
  const noise = (Math.random() - 0.5) * 180;
  const base = elapsedSec * rate + noise;
  return Math.max(0, Math.floor(base));
}

export function generateFinalScore() {
  const min = 50000;
  const max = 100000;
  return Math.floor(min + Math.random() * (max - min));
}

/** Minimal 60s frame timeline (1 sample per second) for rpc_registerFrameTimeline */
export function buildRepresentativeFrameTimeline(videoId, durationSec) {
  const totalFrames = durationSec;
  const frameTimeSeconds = [];
  for (let i = 0; i <= durationSec; i++) {
    frameTimeSeconds.push(i);
  }
  return {
    videoId: videoId,
    totalFrames: totalFrames,
    frameTimeSeconds: frameTimeSeconds,
    videoFps: 30,
  };
}

export function parseNotificationsMessage(rawMessage) {
  try {
    const msg = JSON.parse(rawMessage);
    if (msg && msg.notification) {
      return [msg.notification];
    }
    if (msg && msg.notifications && Array.isArray(msg.notifications.notifications)) {
      return msg.notifications.notifications;
    }
    if (msg && Array.isArray(msg.notifications)) {
      return msg.notifications;
    }
    return [];
  } catch (_e) {
    return [];
  }
}

export function notificationCode(item) {
  if (!item) return 0;
  const raw = item.code != null ? item.code : item.Code;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseNotificationContent(content) {
  if (content == null) return {};
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch (_e) {
      return {};
    }
  }
  if (typeof content === "object") return content;
  return {};
}
