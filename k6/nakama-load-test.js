import { config, targetVusForScenario } from "./config.js";
import { authenticateDevice } from "./helpers/auth.js";
import { getFrameSyncMonitor } from "./helpers/nakama.js";
import {
  runConnectionScenario,
  runFrameSyncStressScenario,
  runScoreStressScenario,
} from "./scenarios/connection.js";
import { runFullGameSession } from "./scenarios/gameplay.js";

const vus = targetVusForScenario();

function buildStages() {
  const stages = [];
  const rampUp = config.rampUp === "0s" ? "1s" : config.rampUp;
  stages.push({ duration: rampUp, target: vus });

  let steady = config.steadyDuration;
  if (!steady || steady === "0s") {
    const holdMs = config.countdownMs + config.videoDurationMs + 45000;
    steady = `${Math.ceil(holdMs / 1000)}s`;
  }
  stages.push({ duration: steady, target: vus });

  const rampDown = config.rampDown === "0s" ? "1s" : config.rampDown;
  stages.push({ duration: rampDown, target: 0 });
  return stages;
}

export const options = {
  scenarios: {
    main: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: buildStages(),
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: [`rate<${config.thresholdHttpFailed}`],
    checks: [`rate>${config.thresholdChecks}`],
    auth_success: [`count>=0`],
    pairing_success_rate: [`rate>${config.thresholdPairingSuccess}`],
    websocket_success_rate: [`rate>${config.thresholdWsSuccess}`],
    sync_success_rate: [`rate>${config.thresholdPairingSuccess}`],
    game_completion_rate: [`rate>${config.thresholdGameCompletion}`],
    final_result_success_rate: [`rate>${config.thresholdGameCompletion}`],
    auth_duration: ["p(95)<5000"],
    pairing_duration: ["p(95)<8000"],
    sync_start_duration: ["p(95)<5000"],
    score_rpc_duration: ["p(95)<3000"],
    frame_sync_duration: ["p(95)<2000"],
    final_result_duration: ["p(95)<5000"],
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

export function handleSummary(data) {
  const authTrend = pickTrend(data, "auth_duration");
  const pairingTrend = pickTrend(data, "pairing_duration");
  const scoreTrend = pickTrend(data, "score_rpc_duration");
  const frameTrend = pickTrend(data, "frame_sync_duration");
  const finalTrend = pickTrend(data, "final_result_duration");

  const syncTrend = pickTrend(data, "sync_start_duration");

  const summaryJson = {
    generatedAt: new Date().toISOString(),
    loadProfile: config.loadProfile,
    scenario: config.scenario,
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
      pairingSuccess: pickCounter(data, "pairing_success"),
      pairingFailure: pickCounter(data, "pairing_failure"),
      gamesStarted: pickCounter(data, "game_started"),
      gameCompleted: pickCounter(data, "game_completed"),
      gameFailed: pickCounter(data, "game_failed"),
      finalResultSuccess: pickCounter(data, "final_result_success"),
      finalResultFailure: pickCounter(data, "final_result_failure"),
      scoreMessagesSent: pickCounter(data, "score_messages_sent"),
      scoreFailures: pickCounter(data, "score_failure"),
      frameSyncPulsesSent: pickCounter(data, "frame_sync_pulses_sent"),
      frameSyncFailures: pickCounter(data, "frame_sync_failure"),
      notificationsReceived: pickCounter(data, "notifications_received"),
      rpcErrors: pickCounter(data, "rpc_errors"),
      pairingSuccessRate: pickRate(data, "pairing_success_rate"),
      syncSuccessRate: pickRate(data, "sync_success_rate"),
      gameCompletionRate: pickRate(data, "game_completion_rate"),
      websocketSuccessRate: pickRate(data, "websocket_success_rate"),
      finalResultSuccessRate: pickRate(data, "final_result_success_rate"),
    },
    latency: {
      auth: authTrend,
      pairing: pairingTrend,
      syncStart: syncTrend,
      score: scoreTrend,
      frameSync: frameTrend,
      finalResult: finalTrend,
    },
    http: data.metrics.http_req_duration
      ? data.metrics.http_req_duration.values
      : null,
  };

  const lines = [];
  lines.push("============================================");
  lines.push("NAKAMA LOAD TEST SUMMARY");
  lines.push("============================================");
  lines.push("");
  lines.push(`Profile:            ${config.loadProfile.toUpperCase()}`);
  lines.push(`Scenario:           ${config.scenario}`);
  lines.push(`k6 VUs:             ${config.tvSessions} (1 TV + 1 mobile each)`);
  lines.push(`Mobile Players:     ${config.mobilePlayers}`);
  lines.push(`TV Sessions:        ${config.tvSessions}`);
  lines.push(`Total Clients:      ${config.mobilePlayers + config.tvSessions} (TV + mobile)`);
  lines.push(`Countdown:          ${config.countdownMs}ms`);
  lines.push(`Gameplay Duration:  ${config.videoDurationMs}ms`);
  lines.push(`Score Interval:     ${config.scoreIntervalMs}ms`);
  lines.push(`Frame Sync Interval:${config.frameSyncIntervalMs}ms`);
  lines.push("");
  lines.push(`Games Started:      ${pickCounter(data, "game_started")}`);
  lines.push(`Games Completed:    ${pickCounter(data, "game_completed")}`);
  lines.push(`Games Failed:       ${pickCounter(data, "game_failed")}`);
  lines.push(`Auth Success:       ${pickCounter(data, "auth_success")}`);
  lines.push(`Auth Failure:       ${pickCounter(data, "auth_failure")}`);
  lines.push(`WebSocket Success:  ${pickCounter(data, "websocket_success")}`);
  lines.push(`WebSocket Failure:  ${pickCounter(data, "websocket_failure")}`);
  lines.push(`WebSocket Disconnects: ${pickCounter(data, "websocket_disconnects")}`);
  lines.push(`Pairing Success:    ${pickCounter(data, "pairing_success")}`);
  lines.push(`Pairing Failure:    ${pickCounter(data, "pairing_failure")}`);
  lines.push(`Sync Start Success: ${pickCounter(data, "sync_success")}`);
  lines.push(`Final Results OK:   ${pickCounter(data, "final_result_success")}`);
  lines.push(`RPC Errors:         ${pickCounter(data, "rpc_errors")}`);
  lines.push(`Score Messages:     ${pickCounter(data, "score_messages_sent")}`);
  lines.push(`Score Failures:     ${pickCounter(data, "score_failure")}`);
  lines.push(`Frame Sync Pulses:  ${pickCounter(data, "frame_sync_pulses_sent")}`);
  lines.push(`Frame Sync Failures:${pickCounter(data, "frame_sync_failure")}`);
  lines.push(`Notifications RX:   ${pickCounter(data, "notifications_received")}`);
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
  if (finalTrend) {
    lines.push(`Final Result    p50=${finalTrend.med} p95=${finalTrend["p(95)"]} p99=${finalTrend["p(99)"]}`);
  }
  if (data.metrics.http_req_duration) {
    const h = data.metrics.http_req_duration.values;
    lines.push(`HTTP Overall    p50=${h.med} p95=${h["p(95)"]} p99=${h["p(99)"]} max=${h.max}`);
  }
  lines.push("");
  lines.push("--------------------------------------------");
  lines.push("RATES");
  lines.push("--------------------------------------------");
  lines.push(`Pairing Success Rate:      ${(pickRate(data, "pairing_success_rate") * 100).toFixed(2)}%`);
  lines.push(`Sync Start Success Rate:   ${(pickRate(data, "sync_success_rate") * 100).toFixed(2)}%`);
  lines.push(`Game Completion Rate:      ${(pickRate(data, "game_completion_rate") * 100).toFixed(2)}%`);
  lines.push(`Final Result Success Rate: ${(pickRate(data, "final_result_success_rate") * 100).toFixed(2)}%`);
  lines.push(`WebSocket Success Rate:    ${(pickRate(data, "websocket_success_rate") * 100).toFixed(2)}%`);
  lines.push(`HTTP Failed Rate:          ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`);
  lines.push("");
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
