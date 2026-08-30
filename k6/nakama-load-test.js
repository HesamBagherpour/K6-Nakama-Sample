import { config, LOAD_LEVEL_TABLE, targetVusForScenario } from "./config.js";
import { authenticateDevice } from "./helpers/auth.js";
import { getFrameSyncMonitor } from "./helpers/nakama.js";
import {
  runConnectionScenario,
  runFrameSyncStressScenario,
  runScoreStressScenario,
} from "./scenarios/connection.js";
import { runFullGameSession } from "./scenarios/gameplay.js";

const vus = targetVusForScenario();

function buildScenarios() {
  const vus = targetVusForScenario();
  const vuStaggerMs = Math.max(0, (vus - 1) * 5000);
  const sessionMs =
    vuStaggerMs +
    45000 +
    config.countdownMs +
    config.videoDurationMs +
    config.finishGraceMs +
    60000;
  const maxDuration = `${Math.max(240, Math.ceil(sessionMs / 1000))}s`;

  return {
    main: {
      executor: "per-vu-iterations",
      vus: vus,
      iterations: 1,
      maxDuration: maxDuration,
    },
  };
}

export const options = {
  scenarios: buildScenarios(),
  thresholds: {
    http_req_failed: [`rate<${config.thresholdHttpFailed}`],
    checks: [`rate>${config.thresholdChecks}`],
    auth_success: [`count>=0`],
    pairing_success_rate: [`rate>${config.thresholdPairingSuccess}`],
    websocket_success_rate: [`rate>${config.thresholdWsSuccess}`],
    sync_success_rate: [`rate>${config.thresholdPairingSuccess}`],
    game_completion_rate: [`rate>${config.thresholdGameCompletion}`],
    cleanup_success_rate: [`rate>${config.thresholdGameCompletion}`],
    leaderboard_writes: ["count==0"],
    leaderboard_errors: ["count==0"],
    auth_duration: ["p(95)<5000"],
    pairing_duration: ["p(95)<8000"],
    sync_start_duration: ["p(95)<5000"],
    score_rpc_duration: ["p(95)<3000"],
    frame_sync_duration: ["p(95)<2000"],
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
};

export function setup() {
  const probe = authenticateDevice("tv", `tv-k6-auth-setup-${Date.now()}`);
  let monitorBefore = null;
  if (probe.ok) {
    const mon = getFrameSyncMonitor(probe.token);
    if (mon.ok) monitorBefore = mon.parsed;
  }

  return {
    startedAt: new Date().toISOString(),
    loadProfile: config.loadProfile,
    scenario: config.scenario,
    targetVus: vus,
    loadClass: config.loadLevel.loadClass,
    vuLevel: config.loadLevel.vus,
    mobilePlayers: config.mobilePlayers,
    tvSessions: config.tvSessions,
    monitorBefore,
    host: config.host,
    port: config.port,
  };
}

export function teardown(data) {
  const probe = authenticateDevice("tv", `tv-k6-auth-teardown-${Date.now()}`);
  if (!probe.ok) return;
  const mon = getFrameSyncMonitor(probe.token);
  if (mon.ok && data) {
    data.monitorAfter = mon.parsed;
  }
}

export default function (data) {
  switch (config.scenario) {
    case "connection":
      runConnectionScenario(__VU, __ITER);
      return;
    case "score-stress":
      runScoreStressScenario(__VU, __ITER);
      return;
    case "frame-sync-stress":
      runFrameSyncStressScenario(__VU, __ITER);
      return;
    case "smoke":
      runFullGameSession(__VU, __ITER);
      return;
    case "gameplay":
    default:
      runFullGameSession(__VU, __ITER);
      return;
  }
}

function pickTrend(data, name) {
  const trend = data.metrics[name];
  if (!trend || !trend.values) return null;
  return trend.values;
}

function pickCounter(data, name) {
  const metric = data.metrics[name];
  if (!metric || !metric.values) return 0;
  return metric.values.count || 0;
}

function pickRate(data, name) {
  const metric = data.metrics[name];
  if (!metric || !metric.values) return 0;
  return metric.values.rate || 0;
}

function extractMonitorFields(monitorPayload) {
  if (!monitorPayload) return {};
  const m =
    monitorPayload.monitor ||
    monitorPayload.result ||
    monitorPayload;
  return {
    framesync_pulse_total: m.pulsesReceived || m.framesync_pulse_total || 0,
    framesync_push_total: m.broadcastsSent || m.framesync_push_total || 0,
    framesync_push_skipped_duplicate: m.framesync_push_skipped_duplicate || 0,
    notification_relay_total: m.notification_relay_total || 0,
    score_relay_total: m.score_relay_total || 0,
    score_relay_throttled_total: m.score_relay_throttled_total || 0,
    ping_duplicate_total: m.ping_duplicate_total || 0,
    broadcastRate: m.broadcastRate || 0,
    connectedUnityClients: m.connectedUnityClients || 0,
    connectedTvClients: m.connectedTvClients || 0,
  };
}

function fmtNum(value) {
  if (value == null || value === "") return "NOT TESTED";
  return String(value);
}

function fmtTrend(trend, key) {
  if (!trend || trend[key] == null) return "NOT TESTED";
  const n = Number(trend[key]);
  return Number.isFinite(n) ? n.toFixed(2) : String(trend[key]);
}

function fmtRate(n, durationMs) {
  const sec = durationMs > 0 ? durationMs / 1000 : 0;
  if (sec <= 0) return "NOT TESTED";
  return (n / sec).toFixed(2);
}

function notTestedSnapshot() {
  return {
    status: "NOT TESTED",
    gamesCompleted: "NOT TESTED",
    gameFailures: "NOT TESTED",
    authLatencyP95: "NOT TESTED",
    pairingLatencyP95: "NOT TESTED",
    syncLatencyP95: "NOT TESTED",
    scoreLatencyP95: "NOT TESTED",
    frameSyncLatencyP95: "NOT TESTED",
    websocketDisconnects: "NOT TESTED",
    rpcErrors: "NOT TESTED",
    scoreMessagesPerSec: "NOT TESTED",
    frameSyncPulsesPerSec: "NOT TESTED",
    notificationsPerSec: "NOT TESTED",
    nakamaCpu: "NOT TESTED",
    nakamaRam: "NOT TESTED",
    postgresCpu: "NOT TESTED",
    postgresRam: "NOT TESTED",
    networkTraffic: "NOT TESTED",
  };
}

function snapshotFromRun(data, durationMs) {
  const authTrend = pickTrend(data, "auth_duration");
  const pairingTrend = pickTrend(data, "pairing_duration");
  const syncTrend = pickTrend(data, "sync_start_duration");
  const scoreTrend = pickTrend(data, "score_rpc_duration");
  const frameTrend = pickTrend(data, "frame_sync_duration");
  return {
    status: "EXECUTED",
    gamesCompleted: pickCounter(data, "game_completed"),
    gameFailures: pickCounter(data, "game_failed"),
    authLatencyP95: fmtTrend(authTrend, "p(95)"),
    pairingLatencyP95: fmtTrend(pairingTrend, "p(95)"),
    syncLatencyP95: fmtTrend(syncTrend, "p(95)"),
    scoreLatencyP95: fmtTrend(scoreTrend, "p(95)"),
    frameSyncLatencyP95: fmtTrend(frameTrend, "p(95)"),
    websocketDisconnects: pickCounter(data, "websocket_disconnects"),
    rpcErrors: pickCounter(data, "rpc_errors"),
    scoreMessagesPerSec: fmtRate(pickCounter(data, "score_messages_sent"), durationMs),
    frameSyncPulsesPerSec: fmtRate(pickCounter(data, "frame_sync_pulses_sent"), durationMs),
    notificationsPerSec: fmtRate(pickCounter(data, "notifications_received"), durationMs),
    nakamaCpu: "NOT MEASURED",
    nakamaRam: "NOT MEASURED",
    postgresCpu: "NOT MEASURED",
    postgresRam: "NOT MEASURED",
    networkTraffic: "NOT MEASURED",
  };
}

function pushSnapshot(lines, title, snap) {
  lines.push(title);
  if (snap.status === "NOT TESTED") {
    lines.push("  Status:                  NOT TESTED");
    lines.push("");
    return;
  }
  lines.push(`  Status:                  ${snap.status}`);
  lines.push(`  Games completed:         ${fmtNum(snap.gamesCompleted)}`);
  lines.push(`  Game failures:           ${fmtNum(snap.gameFailures)}`);
  lines.push(`  Authentication latency:  p95=${fmtNum(snap.authLatencyP95)} ms`);
  lines.push(`  Pairing latency:         p95=${fmtNum(snap.pairingLatencyP95)} ms`);
  lines.push(`  Sync latency:            p95=${fmtNum(snap.syncLatencyP95)} ms`);
  lines.push(`  Score latency:           p95=${fmtNum(snap.scoreLatencyP95)} ms`);
  lines.push(`  FrameSync latency:       p95=${fmtNum(snap.frameSyncLatencyP95)} ms`);
  lines.push(`  WebSocket disconnects:   ${fmtNum(snap.websocketDisconnects)}`);
  lines.push(`  RPC errors:              ${fmtNum(snap.rpcErrors)}`);
  lines.push(`  Score messages/sec:      ${fmtNum(snap.scoreMessagesPerSec)}`);
  lines.push(`  FrameSync pulses/sec:    ${fmtNum(snap.frameSyncPulsesPerSec)}`);
  lines.push(`  Notifications/sec:       ${fmtNum(snap.notificationsPerSec)}`);
  lines.push(`  Nakama CPU:              ${fmtNum(snap.nakamaCpu)}`);
  lines.push(`  Nakama RAM:              ${fmtNum(snap.nakamaRam)}`);
  lines.push(`  PostgreSQL CPU:          ${fmtNum(snap.postgresCpu)}`);
  lines.push(`  PostgreSQL RAM:          ${fmtNum(snap.postgresRam)}`);
  lines.push(`  Network traffic:         ${fmtNum(snap.networkTraffic)}`);
  lines.push("");
}

export function handleSummary(data) {
  const authTrend = pickTrend(data, "auth_duration");
  const pairingTrend = pickTrend(data, "pairing_duration");
  const scoreTrend = pickTrend(data, "score_rpc_duration");
  const frameTrend = pickTrend(data, "frame_sync_duration");
  const syncTrend = pickTrend(data, "sync_start_duration");
  const httpTrend = data.metrics.http_req_duration
    ? data.metrics.http_req_duration.values
    : null;
  const durationMs =
    data.state && data.state.testRunDurationMs
      ? data.state.testRunDurationMs
      : 0;
  const level = config.loadLevel;
  const thisSnapshot = snapshotFromRun(data, durationMs);
  const comparison = {};
  for (let i = 0; i < LOAD_LEVEL_TABLE.length; i++) {
    const row = LOAD_LEVEL_TABLE[i];
    comparison[row.loadClass] =
      level.loadClass === row.loadClass
        ? thisSnapshot
        : notTestedSnapshot();
  }

  const summaryJson = {
    generatedAt: new Date().toISOString(),
    loadProfile: config.loadProfile,
    scenario: config.scenario,
    vuLevel: level.vus,
    loadClass: level.loadClass,
    mobilePlayers: config.mobilePlayers,
    tvSessions: config.tvSessions,
    totalSimulatedClients: config.mobilePlayers + config.tvSessions,
    countdownMs: config.countdownMs,
    videoDurationMs: config.videoDurationMs,
    scoreIntervalMs: config.scoreIntervalMs,
    frameSyncIntervalMs: config.frameSyncIntervalMs,
    metrics: {
      authSuccess: pickCounter(data, "auth_success"),
      authFailure: pickCounter(data, "auth_failure"),
      websocketSuccess: pickCounter(data, "websocket_success"),
      websocketFailure: pickCounter(data, "websocket_failure"),
      websocketDisconnects: pickCounter(data, "websocket_disconnects"),
      pairingSuccess: pickCounter(data, "pairing_complete_success"),
      pairingFailure: pickCounter(data, "pairing_complete_failure"),
      gamesAttempted: pickCounter(data, "game_attempted"),
      gamesStarted: pickCounter(data, "game_started"),
      gameCompleted: pickCounter(data, "game_completed"),
      gameFailed: pickCounter(data, "game_failed"),
      pairingAttempts: pickCounter(data, "pairing_attempts"),
      pairingCompleteSuccess: pickCounter(data, "pairing_complete_success"),
      pairingCompleteFailure: pickCounter(data, "pairing_complete_failure"),
      pairingGenerateSuccess: pickCounter(data, "pairing_generate_success"),
      pairingGenerateFailure: pickCounter(data, "pairing_generate_failure"),
      pairingVerifySuccess: pickCounter(data, "pairing_verify_success"),
      pairingVerifyFailure: pickCounter(data, "pairing_verify_failure"),
      scoreMessagesSent: pickCounter(data, "score_messages_sent"),
      scoreFailures: pickCounter(data, "score_failure"),
      frameSyncPulsesSent: pickCounter(data, "frame_sync_pulses_sent"),
      frameSyncFailures: pickCounter(data, "frame_sync_failure"),
      notificationsReceived: pickCounter(data, "notifications_received"),
      rpcErrors: pickCounter(data, "rpc_errors"),
      cleanupSuccess: pickCounter(data, "cleanup_success"),
      cleanupFailure: pickCounter(data, "cleanup_failure"),
      leaderboardWrites: pickCounter(data, "leaderboard_writes"),
      leaderboardErrors: pickCounter(data, "leaderboard_errors"),
      videoFinishedNotificationsReceived: pickCounter(
        data,
        "video_finished_notifications_received",
      ),
      playbackCompletedSent: pickCounter(data, "playback_completed_sent"),
      pairingSuccessRate: pickRate(data, "pairing_success_rate"),
      syncSuccessRate: pickRate(data, "sync_success_rate"),
      gameCompletionRate: pickRate(data, "game_completion_rate"),
      websocketSuccessRate: pickRate(data, "websocket_success_rate"),
      cleanupSuccessRate: pickRate(data, "cleanup_success_rate"),
    },
    latency: {
      auth: authTrend,
      pairing: pairingTrend,
      syncStart: syncTrend,
      score: scoreTrend,
      frameSync: frameTrend,
    },
    http: httpTrend,
    loadComparison: comparison,
    serverHealth: {
      loadClass: level.loadClass,
      note:
        "LIGHT/MEDIUM/HEAVY is the configured load level, not a health verdict.",
      cpu: "NOT MEASURED",
      ram: "NOT MEASURED",
      nakama: "NOT MEASURED (no host CPU/RAM sampler in this k6 run)",
      postgresql: "NOT MEASURED",
      latencyP95Ms: httpTrend && httpTrend["p(95)"] != null ? httpTrend["p(95)"] : "NOT MEASURED",
      overallHealth:
        "NOT DETERMINED — host CPU/RAM/PostgreSQL were not sampled; do not infer health from the load-class label.",
    },
  };

  const lines = [];
  lines.push("============================================");
  lines.push("NAKAMA LOAD LEVEL");
  lines.push("============================================");
  lines.push("");
  lines.push(`VU Level:        ${level.vus} VU`);
  lines.push(`Load Class:      ${level.loadClass}`);
  lines.push(`TV Sessions:     ${config.tvSessions}`);
  lines.push(`Mobile Players:  ${config.mobilePlayers}`);
  lines.push(`Total Clients:   ${config.mobilePlayers + config.tvSessions}`);
  lines.push("");
  lines.push("============================================");
  lines.push("NAKAMA LOAD TEST SUMMARY");
  lines.push("============================================");
  lines.push("");
  lines.push(`Profile:            ${config.loadProfile.toUpperCase()}`);
  lines.push(`Scenario:           ${config.scenario}`);
  lines.push(`k6 VUs:             ${level.vus}`);
  lines.push(`Load Level:         ${level.loadClass}`);
  lines.push(`Mobile Players:     ${config.mobilePlayers}`);
  lines.push(`TV Sessions:        ${config.tvSessions}`);
  lines.push(`Total Clients:      ${config.mobilePlayers + config.tvSessions} (TV + mobile)`);
  lines.push(`Countdown:          ${config.countdownMs}ms`);
  lines.push(`Gameplay Duration:  ${config.videoDurationMs}ms`);
  lines.push(`Score Interval:     ${config.scoreIntervalMs}ms`);
  lines.push(`Frame Sync Interval:${config.frameSyncIntervalMs}ms`);
  lines.push("");
  lines.push(`Games Attempted:    ${pickCounter(data, "game_attempted")}`);
  lines.push(`Games Started:      ${pickCounter(data, "game_started")}`);
  lines.push(`Games Completed:    ${pickCounter(data, "game_completed")}`);
  lines.push(`Games Failed:       ${pickCounter(data, "game_failed")}`);
  lines.push(`Auth Success:       ${pickCounter(data, "auth_success")}`);
  lines.push(`Auth Failure:       ${pickCounter(data, "auth_failure")}`);
  lines.push(`WebSocket Success:  ${pickCounter(data, "websocket_success")}`);
  lines.push(`WebSocket Failure:  ${pickCounter(data, "websocket_failure")}`);
  lines.push(`WebSocket Disconnects: ${pickCounter(data, "websocket_disconnects")}`);
  lines.push(`Pairing Attempts:   ${pickCounter(data, "pairing_attempts")}`);
  lines.push(`Pairing Complete OK:${pickCounter(data, "pairing_complete_success")}`);
  lines.push(`Pairing Complete Fail:${pickCounter(data, "pairing_complete_failure")}`);
  lines.push(`Pairing Generate OK:${pickCounter(data, "pairing_generate_success")}`);
  lines.push(`Pairing Generate Fail:${pickCounter(data, "pairing_generate_failure")}`);
  lines.push(`Pairing Verify OK:  ${pickCounter(data, "pairing_verify_success")}`);
  lines.push(`Pairing Verify Fail:${pickCounter(data, "pairing_verify_failure")}`);
  lines.push(`Sync Start Success: ${pickCounter(data, "sync_success")}`);
  lines.push(`Gameplay Completed: ${pickCounter(data, "game_completed")}`);
  lines.push(
    `Results Received TV: ${pickCounter(data, "video_finished_notifications_received")}`,
  );
  lines.push(`Playback Completed: ${pickCounter(data, "playback_completed_sent")}`);
  lines.push(`Gameplay Cleanup OK:${pickCounter(data, "cleanup_success")}`);
  lines.push(`Gameplay Cleanup Fail:${pickCounter(data, "cleanup_failure")}`);
  lines.push(`Leaderboard Writes: ${pickCounter(data, "leaderboard_writes")}`);
  lines.push(`Leaderboard Errors: ${pickCounter(data, "leaderboard_errors")}`);
  lines.push(`RPC Errors:         ${pickCounter(data, "rpc_errors")}`);
  lines.push(`Score Messages:     ${pickCounter(data, "score_messages_sent")}`);
  lines.push(`Score Failures:     ${pickCounter(data, "score_failure")}`);
  lines.push(`Frame Sync Pulses:  ${pickCounter(data, "frame_sync_pulses_sent")}`);
  lines.push(`Frame Sync Failures:${pickCounter(data, "frame_sync_failure")}`);
  lines.push(`Notifications RX:   ${pickCounter(data, "notifications_received")}`);
  lines.push("");
  const checksMetric = data.metrics.checks;
  if (checksMetric && checksMetric.values) {
    lines.push(`Checks Pass:        ${checksMetric.values.passes ?? 0}`);
    lines.push(`Checks Fail:        ${checksMetric.values.fails ?? 0}`);
  }
  const iterMetric = data.metrics.iterations;
  if (iterMetric && iterMetric.values) {
    lines.push(`Iterations:         ${iterMetric.values.count ?? 0}`);
  }
  const dataRecv = data.metrics.data_received;
  const dataSent = data.metrics.data_sent;
  if (dataRecv && dataRecv.values) {
    lines.push(`Data Received:      ${Math.round(dataRecv.values.count ?? 0)} bytes`);
  }
  if (dataSent && dataSent.values) {
    lines.push(`Data Sent:          ${Math.round(dataSent.values.count ?? 0)} bytes`);
  }
  lines.push("");
  lines.push("--------------------------------------------");
  lines.push("LATENCY (ms)");
  lines.push("--------------------------------------------");
  if (authTrend) {
    lines.push(`Authentication  p50=${authTrend.med} p95=${authTrend["p(95)"]} p99=${authTrend["p(99)"]}`);
  }
  if (pairingTrend) {
    lines.push(`Pairing         p50=${pairingTrend.med} p95=${pairingTrend["p(95)"]} p99=${pairingTrend["p(99)"]}`);
  }
  if (syncTrend) {
    lines.push(`Sync Start      p50=${syncTrend.med} p95=${syncTrend["p(95)"]} p99=${syncTrend["p(99)"]}`);
  }
  if (scoreTrend) {
    lines.push(`Score RPC       p50=${scoreTrend.med} p95=${scoreTrend["p(95)"]} p99=${scoreTrend["p(99)"]}`);
  }
  if (frameTrend) {
    lines.push(`Frame Sync      p50=${frameTrend.med} p95=${frameTrend["p(95)"]} p99=${frameTrend["p(99)"]}`);
  }
  if (httpTrend) {
    lines.push(`HTTP Overall    p50=${httpTrend.med} p95=${httpTrend["p(95)"]} p99=${httpTrend["p(99)"]} max=${httpTrend.max}`);
  }
  lines.push("");
  lines.push("--------------------------------------------");
  lines.push("RATES");
  lines.push("--------------------------------------------");
  lines.push(`Pairing Success Rate:      ${(pickRate(data, "pairing_success_rate") * 100).toFixed(2)}%`);
  lines.push(`Sync Start Success Rate:   ${(pickRate(data, "sync_success_rate") * 100).toFixed(2)}%`);
  lines.push(`Game Completion Rate:      ${(pickRate(data, "game_completion_rate") * 100).toFixed(2)}%`);
  lines.push(`Gameplay Cleanup Success:  ${(pickRate(data, "cleanup_success_rate") * 100).toFixed(2)}%`);
  lines.push(`WebSocket Success Rate:    ${(pickRate(data, "websocket_success_rate") * 100).toFixed(2)}%`);
  lines.push(`HTTP Failed Rate:          ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`);
  lines.push("");
  lines.push("--------------------------------------------");
  lines.push(`SERVER HEALTH — ${level.loadClass} (${level.vus} VU)`);
  lines.push("--------------------------------------------");
  lines.push("The load-class label describes configured load, not health.");
  lines.push(`CPU:              NOT MEASURED`);
  lines.push(`RAM:              NOT MEASURED`);
  lines.push(`Nakama:           NOT MEASURED (no host sampler in this k6 run)`);
  lines.push(`PostgreSQL:       NOT MEASURED`);
  lines.push(
    `Latency:          HTTP p95=${httpTrend && httpTrend["p(95)"] != null ? httpTrend["p(95)"] : "NOT MEASURED"} ms`,
  );
  lines.push(
    "Overall health:   NOT DETERMINED (CPU/RAM/PostgreSQL were not sampled)",
  );
  lines.push("");
  lines.push("--------------------------------------------");
  lines.push("LOAD LEVEL COMPARISON");
  lines.push("--------------------------------------------");
  lines.push("10 VU  — LIGHT");
  lines.push("25 VU  — MEDIUM");
  lines.push("50 VU  — HEAVY");
  lines.push("");
  pushSnapshot(lines, "10 VU — LIGHT", comparison.LIGHT);
  pushSnapshot(lines, "25 VU — MEDIUM", comparison.MEDIUM);
  pushSnapshot(lines, "50 VU — HEAVY", comparison.HEAVY);
  lines.push("--------------------------------------------");
  lines.push("SERVER (rpc_getFrameSyncMonitor at teardown)");
  lines.push("--------------------------------------------");
  lines.push("Run teardown probe or query monitor manually for live counters.");
  lines.push("Expected monitor fields: pulsesReceived, broadcastsSent, score relay counters.");
  lines.push("");
  lines.push("============================================");

  return {
    stdout: lines.join("\n") + "\n",
    "summary.json": JSON.stringify(summaryJson, null, 2),
    "results.json": JSON.stringify(data, null, 2),
  };
}
