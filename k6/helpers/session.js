export const SessionState = {
  AUTHENTICATED: "AUTHENTICATED",
  PAIRING_STARTED: "PAIRING_STARTED",
  PAIRED: "PAIRED",
  VIDEO_READY: "VIDEO_READY",
  SYNCED: "SYNCED",
  GAMEPLAY: "GAMEPLAY",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

const ORDER = [
  SessionState.AUTHENTICATED,
  SessionState.PAIRING_STARTED,
  SessionState.PAIRED,
  SessionState.VIDEO_READY,
  SessionState.SYNCED,
  SessionState.GAMEPLAY,
  SessionState.COMPLETED,
];

export function createLifecycle(vu, iter, ids) {
  return {
    vu,
    iter,
    tvAuthDeviceId: ids.tvAuthDeviceId,
    tvLinkDeviceId: ids.tvLinkDeviceId,
    mobileDeviceId: ids.mobileDeviceId,
    loginCode: null,
    reached: [],
    current: null,
    failed: false,
    failRpc: null,
    failHttpStatus: null,
    failCode: null,
    failMessage: null,
    failBody: null,
  };
}

export function markState(life, state) {
  if (!life.reached.includes(state)) {
    life.reached.push(state);
  }
  life.current = state;
}

export function logDeviceIds(life) {
  console.log(`VU ${life.vu}:`);
  console.log(`TV auth ID = ${life.tvAuthDeviceId}`);
  console.log(`TV link ID = ${life.tvLinkDeviceId}`);
  console.log(`Mobile ID = ${life.mobileDeviceId}`);
}

function mark(reached, state) {
  return reached.includes(state) ? "✅" : "❌";
}

export function failSession(life, details) {
  life.failed = true;
  life.current = SessionState.FAILED;
  life.failRpc = details.rpc || details.stage || "unknown";
  life.failHttpStatus = details.status != null ? details.status : null;
  life.failCode = details.code != null ? details.code : null;
  life.failMessage = details.message || details.error || "";
  life.failBody = details.body != null ? String(details.body) : "";
  if (details.loginCode != null) life.loginCode = details.loginCode;

  const lines = [];
  lines.push(`Game ${life.vu} (iter ${life.iter}):`);
  for (let i = 0; i < ORDER.length; i++) {
    const state = ORDER[i];
    if (state === SessionState.COMPLETED && !life.reached.includes(state)) {
      continue;
    }
    if (
      !life.reached.includes(state) &&
      state !== SessionState.AUTHENTICATED &&
      !ORDER.slice(0, i).every((s) => life.reached.includes(s))
    ) {
      lines.push(`${state} ❌`);
      break;
    }
    lines.push(`${state} ${mark(life.reached, state)}`);
    if (!life.reached.includes(state)) break;
  }
  lines.push(`FAILED: ${life.failRpc}`);
  if (life.failHttpStatus != null) {
    lines.push(`HTTP ${life.failHttpStatus}`);
  }
  if (life.failCode != null && life.failCode !== 0) {
    lines.push(`code: ${life.failCode}`);
  }
  if (life.failMessage) {
    lines.push(`message: ${life.failMessage}`);
  }
  if (life.failBody) {
    lines.push(`body: ${life.failBody}`);
  }
  lines.push(`TV auth deviceId: ${life.tvAuthDeviceId}`);
  lines.push(`TV link deviceId: ${life.tvLinkDeviceId}`);
  lines.push(`Mobile deviceId: ${life.mobileDeviceId}`);
  if (life.loginCode != null) {
    lines.push(`loginCode: ${life.loginCode}`);
  }
  console.error(lines.join("\n"));
}

export function logSessionComplete(life) {
  console.log(
    `Game ${life.vu}: AUTHENTICATED ✅ PAIRING_STARTED ✅ PAIRED ✅ VIDEO_READY ✅ SYNCED ✅ GAMEPLAY ✅ COMPLETED ✅`,
  );
}
