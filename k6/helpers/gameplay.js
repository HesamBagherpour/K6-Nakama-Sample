import { check } from "k6";
import { config } from "../config.js";
import { callRpc } from "./nakama.js";
import {
  frameSyncDuration,
  frameSyncFailure,
  frameSyncPulsesSent,
  frameSyncSuccess,
  scoreFailure,
  scoreMessagesSent,
  scoreRpcDuration,
  scoreSuccess,
  serverTimeDuration,
  gameStarted,
  syncFailure,
  syncStartDuration,
  syncSuccess,
  syncSuccessRate,
} from "./metrics.js";
import { NOTIFICATION_CODES, sendNotification } from "./pairing.js";
import {
  buildRepresentativeFrameTimeline,
  generateFinalScore,
  generateLiveScore,
} from "./utils.js";

export function registerFrameTimeline(mobileToken, videoId) {
  const durationSec = Math.ceil(config.videoDurationMs / 1000);
  const timeline = buildRepresentativeFrameTimeline(videoId, durationSec);
  return callRpc(mobileToken, "rpc_registerFrameTimeline", timeline, {
    phase: "gameplay",
  });
}

export function generateSyncStart(mobileToken, videoId) {
  const start = Date.now();
  const result = callRpc(
    mobileToken,
    "rpc_generateSyncStartAt",
    {
      videoId: videoId,
      countdownMs: config.countdownMs,
    },
    { phase: "sync" },
  );
  syncStartDuration.add(Date.now() - start);

  const ok = check(result, {
    "sync start ok": (r) => r.ok && r.parsed != null,
    "sync startAt present": (r) => {
      const p = r.parsed;
      return p && (p.startAt != null || p.start_at != null);
    },
  });

  if (!ok) {
    syncFailure.add(1);
    syncSuccessRate.add(false);
    return { ok: false, error: result.error || "sync start failed" };
  }

  syncSuccess.add(1);
  syncSuccessRate.add(true);
  gameStarted.add(1);
  const parsed = result.parsed;
  const startAt = Number(parsed.startAt != null ? parsed.startAt : parsed.start_at);
  return {
    ok: true,
    startAt,
    syncSessionId: parsed.syncSessionId || parsed.sync_session_id || "",
    countdownMs: Number(parsed.countdownMs || config.countdownMs),
    reused: !!parsed.reused,
  };
}

export function pulseFrameSync(token, role, playerCount, lastSequence) {
  const start = Date.now();
  const result = callRpc(
    token,
    "rpc_frameSync_pulse",
    {
      clientRole: role,
      clientRttMs: 20 + Math.floor(Math.random() * 40),
      clientOffsetMs: 0,
      playerCount: playerCount,
      lastReceivedSequence: lastSequence || 0,
    },
    { phase: "frame_sync", role: role },
  );
  frameSyncDuration.add(Date.now() - start);
  frameSyncPulsesSent.add(1);

  if (!result.ok) {
    frameSyncFailure.add(1);
    return { ok: false, error: result.error };
  }

  frameSyncSuccess.add(1);
  let sequence = lastSequence || 0;
  if (result.parsed && result.parsed.frameSync && result.parsed.frameSync.sequence != null) {
    sequence = Number(result.parsed.frameSync.sequence);
  }
  return { ok: true, parsed: result.parsed, sequence: sequence };
}

export function fetchServerTime(token) {
  const start = Date.now();
  const result = callRpc(token, "rpc_getServerTime", {}, { phase: "clock_sync" });
  serverTimeDuration.add(Date.now() - start);
  return result;
}

export function sendLiveScore(mobileToken, mobileSubject, playerSlot, totalScore, pointsAdded) {
  const start = Date.now();
  const result = sendNotification(
    mobileToken,
    mobileSubject,
    NOTIFICATION_CODES.OnPlayerTotalScoreChanged,
    {
      newTotalScore: totalScore,
      pointsAdded: pointsAdded,
      playerSlot: playerSlot,
      rating: pointsAdded > 900 ? "perfect" : "good",
      feedback: "k6-simulated",
    },
  );
  scoreRpcDuration.add(Date.now() - start);
  scoreMessagesSent.add(1);

  if (!result.ok) {
    scoreFailure.add(1);
    return { ok: false, error: result.error };
  }

  scoreSuccess.add(1);
  return { ok: true };
}

export function sendDanceFinished(mobileToken, mobileSubject, videoId, playerCount, scores) {
  const content = {
    videoId: videoId,
    playerCount: playerCount,
    isSessionComplete: true,
    videoDurationSeconds: Math.ceil(config.videoDurationMs / 1000),
  };

  if (playerCount >= 2 && scores.length >= 2) {
    content.player1Score = scores[0];
    content.player2Score = scores[1];
    content.players = [
      { playerSlot: 1, score: scores[0] },
      { playerSlot: 2, score: scores[1] },
    ];
  } else if (scores.length >= 1) {
    content.finalScore = scores[0];
    content.players = [{ playerSlot: 1, score: scores[0] }];
  }

  return sendNotification(
    mobileToken,
    mobileSubject,
    NOTIFICATION_CODES.OnDanceVideoFinished,
    content,
  );
}

/**
 * End-of-gameplay notification only (code 13).
 * Does not call rpc_dance_submitSessionResults and does not write leaderboards.
 */
export function sendGameplayFinished(mobilePlayers, videoId, playerCount, slotScores) {
  const results = [];
  for (let i = 0; i < mobilePlayers.length; i++) {
    const mobile = mobilePlayers[i];
    const slot = i + 1;
    const finalScore =
      slotScores[i] > 0 ? slotScores[i] : generateFinalScore();

    const finished = sendDanceFinished(
      mobile.token,
      mobile.subject,
      videoId,
      playerCount,
      slotScores.length ? slotScores : [finalScore],
    );
    if (!finished.ok) {
      console.error(
        [
          "FAILED: OnDanceVideoFinished (code 13)",
          finished.status != null ? `HTTP ${finished.status}` : "",
          finished.errorCode != null ? `code: ${finished.errorCode}` : "",
          finished.error ? `message: ${finished.error}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }

    results.push({
      slot,
      finalScore,
      videoFinishedOk: finished.ok,
    });
  }
  return results;
}
