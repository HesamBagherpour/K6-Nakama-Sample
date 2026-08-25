/**
 * Nakama dance game load test configuration.
 *
 * Load model (1:1 TV-to-mobile):
 *   One k6 VU = 1 TV + 1 mobile (one complete game session).
 *
 * Load classes (configured VU count, not server health):
 *   10 VU  → LIGHT   (10 TV + 10 mobile = 20 clients)
 *   25 VU  → MEDIUM  (25 TV + 25 mobile = 50 clients)
 *   50 VU  → HEAVY   (50 TV + 50 mobile = 100 clients)
 *
 * Current phase: execute LIGHT (10 VU) only.
 * MEDIUM and HEAVY are defined for later runs and must not start
 * unless ALLOW_HIGHER_LOAD=1 is set explicitly.
 */

function envInt(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envFloat(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === "") return fallback;
  const v = String(raw).toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

const host = __ENV.NAKAMA_HOST || "85.198.11.216";
const port = __ENV.NAKAMA_PORT || "7350";
const useTls = envBool("NAKAMA_USE_TLS", false);

function resolvePairCounts() {
  const tvRaw = __ENV.TV_SESSIONS;
  const mobileRaw = __ENV.MOBILE_PLAYERS;
  const legacyRaw = __ENV.TOTAL_PLAYERS;

  const tvSet = tvRaw !== undefined && tvRaw !== "";
  const mobileSet = mobileRaw !== undefined && mobileRaw !== "";

  if (tvSet && mobileSet) {
    return {
      tvSessions: parseInt(tvRaw, 10),
      mobilePlayers: parseInt(mobileRaw, 10),
    };
  }

  if (tvSet) {
    const tv = parseInt(tvRaw, 10);
    return { tvSessions: tv, mobilePlayers: tv };
  }

  if (mobileSet) {
    const mobile = parseInt(mobileRaw, 10);
    return { tvSessions: mobile, mobilePlayers: mobile };
  }

  const fallback = legacyRaw ? parseInt(legacyRaw, 10) : 10;
  return { tvSessions: fallback, mobilePlayers: fallback };
}

/** Configured load classes. Do not infer server health from these labels. */
export const LOAD_LEVEL_TABLE = [
  { vus: 10, loadClass: "LIGHT", tvSessions: 10, mobilePlayers: 10, totalClients: 20 },
  { vus: 25, loadClass: "MEDIUM", tvSessions: 25, mobilePlayers: 25, totalClients: 50 },
  { vus: 50, loadClass: "HEAVY", tvSessions: 50, mobilePlayers: 50, totalClients: 100 },
];

export function classifyLoad(vuCount, tvSessions, mobilePlayers) {
  const vus = Number(vuCount);
  const known = LOAD_LEVEL_TABLE.find((row) => row.vus === vus);
  if (known) {
    return Object.assign({}, known);
  }
  const tv = Number(tvSessions);
  const mobile = Number(mobilePlayers);
  return {
    vus: vus,
    loadClass: "UNCLASSIFIED",
    tvSessions: Number.isFinite(tv) ? tv : vus,
    mobilePlayers: Number.isFinite(mobile) ? mobile : vus,
    totalClients:
      (Number.isFinite(tv) ? tv : 0) + (Number.isFinite(mobile) ? mobile : 0),
  };
}

const pairCounts = resolvePairCounts();

const httpScheme = useTls ? "https" : "http";
const wsScheme = useTls ? "wss" : "ws";

/** Device auth uses Nakama socket.server_key (NOT runtime http_key). */
const serverKey = __ENV.NAKAMA_SERVER_KEY || "";

if (!serverKey) {
  throw new Error(
    "Missing NAKAMA_SERVER_KEY for device authentication (do not use NAKAMA_HTTP_KEY)",
  );
}

export const config = {
  host,
  port,
  httpBase: `${httpScheme}://${host}:${port}`,
  wsBase: `${wsScheme}://${host}:${port}`,
  serverKey,
  httpKey: __ENV.NAKAMA_HTTP_KEY || "",

  scenario: (__ENV.SCENARIO || "gameplay").toLowerCase(),
  loadProfile: (__ENV.LOAD_PROFILE || "load").toLowerCase(),

  /** Mobile player count (= TV count = k6 VUs for gameplay scenarios) */
  mobilePlayers: pairCounts.mobilePlayers,
  tvSessions: pairCounts.tvSessions,
  loadLevel: classifyLoad(
    pairCounts.tvSessions,
    pairCounts.tvSessions,
    pairCounts.mobilePlayers,
  ),

  videoId: envInt("VIDEO_ID", 0),
  countdownMs: envInt("COUNTDOWN_MS", 10000),
  videoDurationMs: envInt("VIDEO_DURATION_MS", 60000),

  scoreIntervalMs: envInt("SCORE_INTERVAL_MS", 1000),
  frameSyncIntervalMs: envInt("FRAME_SYNC_INTERVAL_MS", 250),
  serverTimeIntervalMs: envInt("SERVER_TIME_INTERVAL_MS", 30000),
  wsPingIntervalMs: envInt("WS_PING_INTERVAL_MS", 5000),

  rampUp: __ENV.RAMP_UP || "30s",
  steadyDuration: __ENV.STEADY_DURATION || "0s",
  rampDown: __ENV.RAMP_DOWN || "10s",

  httpTimeout: __ENV.HTTP_TIMEOUT || "15s",
  wsTimeout: __ENV.WS_TIMEOUT || "120s",

  jitterAuthMaxMs: envInt("JITTER_AUTH_MAX_MS", 2000),
  jitterPairingMaxMs: envInt("JITTER_PAIRING_MAX_MS", 5000),
  jitterVideoMaxMs: envInt("JITTER_VIDEO_MAX_MS", 4000),

  thresholdHttpFailed: envFloat("THRESHOLD_HTTP_FAILED", 0.05),
  thresholdChecks: envFloat("THRESHOLD_CHECKS", 0.95),
  thresholdAuthSuccess: envFloat("THRESHOLD_AUTH_SUCCESS", 0.95),
  thresholdWsSuccess: envFloat("THRESHOLD_WS_SUCCESS", 0.95),
  thresholdPairingSuccess: envFloat("THRESHOLD_PAIRING_SUCCESS", 0.95),
  thresholdGameCompletion: envFloat("THRESHOLD_GAME_COMPLETION", 0.95),

  enableMobileWs: envBool("ENABLE_MOBILE_WS", false),
  skipCleanup: envBool("SKIP_CLEANUP", false),
  allowHigherLoad: envBool("ALLOW_HIGHER_LOAD", false),
};

export function targetVusForScenario() {
  switch (config.scenario) {
    case "connection":
      return envInt("CONNECTION_VUS", 10);
    case "score-stress":
    case "frame-sync-stress":
    case "gameplay":
    default:
      return config.tvSessions;
  }
}

export function validateConfig() {
  if (config.tvSessions < 1) {
    throw new Error("TV_SESSIONS must be >= 1");
  }
  if (config.mobilePlayers !== config.tvSessions) {
    throw new Error(
      `MOBILE_PLAYERS (${config.mobilePlayers}) must equal TV_SESSIONS (${config.tvSessions}) — 1:1 model`,
    );
  }
  const vus = config.tvSessions;
  if (vus > 10 && !config.allowHigherLoad) {
    throw new Error(
      "This phase only executes LIGHT (10 VU) or smaller smoke. " +
        "25 VU MEDIUM and 50 VU HEAVY are configured but not run. " +
        "Set ALLOW_HIGHER_LOAD=1 only when that load is explicitly requested.",
    );
  }
}

validateConfig();
