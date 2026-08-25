import { sleep } from "k6";
import { check } from "k6";
import { config } from "../config.js";
import { authenticateDevice } from "../helpers/auth.js";
import { fetchDefaultVideoId } from "../helpers/nakama.js";
import {
  activeGames,
  activePlayers,
  activeTvSessions,
  cleanupFailure,
  cleanupSuccess,
  cleanupSuccessRate,
  gameAttempted,
  gameCompleted,
  gameCompletionRate,
  gameFailed,
  gameStarted,
  leaderboardErrors,
  leaderboardWrites,
  videoSelectionDuration,
} from "../helpers/metrics.js";
import {
  fetchServerTime,
  generateSyncStart,
  pulseFrameSync,
  registerFrameTimeline,
  sendGameplayFinished,
  sendLiveScore,
} from "../helpers/gameplay.js";
import {
  runPairingFlow,
  sendMobileVideoUnityReady,
  sendSessionEnded,
  sendVideoSelectionFlow,
  unlinkDevice,
} from "../helpers/pairing.js";
import { connectNakamaWebSocket } from "../helpers/websocket.js";
import {
  createSessionContext,
  generateLiveScore,
  jitterMs as randomJitter,
} from "../helpers/utils.js";
import {
  SessionState,
  createLifecycle,
  failSession,
  logDeviceIds,
  logSessionComplete,
  markState,
} from "../helpers/session.js";

function endFailed(life, stage, extra) {
  if (!life.failed) {
    failSession(life, Object.assign({ stage: stage }, extra || {}));
  }
  gameFailed.add(1);
  gameCompletionRate.add(false);
  activeTvSessions.add(-1);
  activeGames.add(-1);
  activePlayers.add(-1);
}

/**
 * One k6 VU = exactly ONE game session:
 *   1 TV  (auth + WebSocket + pairing host)
 *   1 Mobile player (auth + gameplay RPCs)
 *
 * Executor is per-vu-iterations with iterations=1, so a failed pairing
 * must NOT start another game.
 */
export function runFullGameSession(vu, iter) {
  const session = createSessionContext(vu, iter);
  const playerCount = 1;
  const life = createLifecycle(vu, iter, session);

  gameAttempted.add(1);
  leaderboardWrites.add(0);
  leaderboardErrors.add(0);
  activeTvSessions.add(1);
  activeGames.add(1);
  activePlayers.add(1);
  logDeviceIds(life);

  sleep(randomJitter(config.jitterAuthMaxMs) / 1000);

  const tvAuth = authenticateDevice("tv", session.tvAuthDeviceId);
  if (!tvAuth.ok) {
    endFailed(life, "tv_auth", {
      rpc: "POST /v2/account/authenticate/device",
      status: null,
      message: "TV authentication failed",
      body: tvAuth.body || "",
    });
    return { ok: false, stage: "tv_auth", sessionKey: session.sessionKey };
  }
  tvAuth.linkDeviceId = session.tvLinkDeviceId;

  const mobileAuth = authenticateDevice("mobile", session.mobileDeviceId);
  if (!mobileAuth.ok) {
    endFailed(life, "mobile_auth", {
      rpc: "POST /v2/account/authenticate/device",
      message: "Mobile authentication failed",
      body: mobileAuth.body || "",
    });
    return { ok: false, stage: "mobile_auth", sessionKey: session.sessionKey };
  }

  markState(life, SessionState.AUTHENTICATED);

  sleep(randomJitter(config.jitterPairingMaxMs) / 1000);

  const pairingWaitMs = 5000;
  const wsDurationMs =
    pairingWaitMs +
    config.countdownMs +
    config.videoDurationMs +
    20000;

  const mobilePlayer = {
    token: mobileAuth.token,
    deviceId: mobileAuth.deviceId,
    subject: session.mobileSubject,
  };

  let syncInfo = null;
  let liveScore = 0;
  let lastSequence = 0;
  let gameplayStarted = false;
  let gameplayEnded = false;
  let videoId = 1;
  let gameplayFinished = null;
  let innerFailed = false;

  function continueAfterPaired(socket, _state) {
    const videoStart = Date.now();
    const videoPick = fetchDefaultVideoId(tvAuth.token);
    videoId = videoPick.videoId;
    videoSelectionDuration.add(Date.now() - videoStart);

    const videoFlow = sendVideoSelectionFlow(
      tvAuth.token,
      session.tvSubject,
      videoId,
      playerCount,
    );
    if (!videoFlow.ok) {
      innerFailed = true;
      failSession(life, {
        rpc: "rpc_multiSession_sendNotificationToSessions",
        message: videoFlow.error || "video selection failed",
        body: videoFlow.result && videoFlow.result.body,
        status: videoFlow.result && videoFlow.result.status,
        code: videoFlow.result && videoFlow.result.errorCode,
      });
      socket.close();
      return;
    }

    const unityReady = sendMobileVideoUnityReady(
      mobilePlayer.token,
      mobilePlayer.subject,
      videoId,
    );
    if (!unityReady.ok) {
      innerFailed = true;
      failSession(life, {
        rpc: "rpc_multiSession_sendNotificationToSessions",
        message: unityReady.error || "VideoUnityReady failed",
        body: unityReady.body,
        status: unityReady.status,
        code: unityReady.errorCode,
      });
      socket.close();
      return;
    }
    markState(life, SessionState.VIDEO_READY);
    registerFrameTimeline(mobilePlayer.token, videoId);

    syncInfo = generateSyncStart(mobilePlayer.token, videoId);
    if (!syncInfo.ok) {
      innerFailed = true;
      failSession(life, {
        rpc: "rpc_generateSyncStartAt",
        message: syncInfo.error || "sync start failed",
      });
      socket.close();
      return;
    }
    markState(life, SessionState.SYNCED);

    const waitCountdownMs = Math.max(1000, syncInfo.startAt - Date.now());

    socket.setTimeout(function () {
      gameplayStarted = true;
      markState(life, SessionState.GAMEPLAY);

      socket.setInterval(function () {
        if (gameplayEnded) return;

        const tvPulse = pulseFrameSync(
          tvAuth.token,
          "tv",
          playerCount,
          lastSequence,
        );
        if (tvPulse.ok && tvPulse.sequence) {
          lastSequence = tvPulse.sequence;
        }

        const mobPulse = pulseFrameSync(
          mobilePlayer.token,
          "unity",
          playerCount,
          lastSequence,
        );
        if (mobPulse.ok && mobPulse.sequence) {
          lastSequence = mobPulse.sequence;
        }
      }, config.frameSyncIntervalMs);

      socket.setInterval(function () {
        fetchServerTime(tvAuth.token);
      }, config.serverTimeIntervalMs);

      let scoreTick = 0;
      socket.setInterval(function () {
        if (gameplayEnded) return;
        scoreTick += 1;
        const elapsedSec = scoreTick * (config.scoreIntervalMs / 1000);
        const prev = liveScore;
        const total = generateLiveScore(elapsedSec);
        const delta = Math.max(0, total - prev);
        liveScore = total;
        sendLiveScore(mobilePlayer.token, mobilePlayer.subject, 1, total, delta);
      }, config.scoreIntervalMs);

      socket.setTimeout(function () {
        gameplayEnded = true;
      }, config.videoDurationMs);
    }, waitCountdownMs);
  }

  const wsResult = connectNakamaWebSocket({
    token: tvAuth.token,
    durationMs: wsDurationMs,
    onOpen: function (socket, state) {
      markState(life, SessionState.PAIRING_STARTED);

      const pairing = runPairingFlow(tvAuth, [mobileAuth], session.tvLinkDeviceId, life);
      if (!pairing.ok) {
        innerFailed = true;
        socket.close();
        return;
      }

      socket.setTimeout(function () {
        if (!state.pairingAccepted) {
          innerFailed = true;
          failSession(life, {
            rpc: "pairing confirmation (notification code 4)",
            message:
              "verifyAndAccept succeeded but TV did not receive ReceiveAcceptedLinkLoginCode",
            loginCode: pairing.loginCode,
          });
          socket.close();
          return;
        }
        markState(life, SessionState.PAIRED);
        continueAfterPaired(socket, state);
      }, 1500);
    },
  });

  if (innerFailed) {
    endFailed(life, life.failRpc || "pairing");
    return { ok: false, stage: life.failRpc || "pairing", sessionKey: session.sessionKey, life };
  }

  if (!wsResult.connected) {
    endFailed(life, "websocket", {
      rpc: "Nakama WebSocket",
      message: "TV WebSocket did not connect",
    });
    return { ok: false, stage: "websocket", sessionKey: session.sessionKey };
  }

  gameplayFinished = sendGameplayFinished(
    [mobilePlayer],
    videoId,
    playerCount,
    [liveScore],
  );
  const videoFinishedOk =
    gameplayFinished.length > 0 &&
    gameplayFinished.every((r) => r.videoFinishedOk);

  let cleanupOk = true;
  if (!config.skipCleanup) {
    const ended = sendSessionEnded(tvAuth.token, session.tvSubject, "k6-test-complete");
    const unlinked = unlinkDevice(mobilePlayer.token, session.tvLinkDeviceId);
    cleanupOk = !!(ended.ok && unlinked.ok);
    if (cleanupOk) {
      cleanupSuccess.add(1);
      cleanupSuccessRate.add(true);
    } else {
      cleanupFailure.add(1);
      cleanupSuccessRate.add(false);
      if (!ended.ok) {
        console.error(
          [
            "FAILED: SessionEnded (code 17) cleanup",
            ended.status != null ? `HTTP ${ended.status}` : "",
            ended.errorCode != null ? `code: ${ended.errorCode}` : "",
            ended.error ? `message: ${ended.error}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      if (!unlinked.ok) {
        console.error(
          [
            "FAILED: rpc_multiSession_unlinkDevice cleanup",
            unlinked.status != null ? `HTTP ${unlinked.status}` : "",
            unlinked.errorCode != null ? `code: ${unlinked.errorCode}` : "",
            unlinked.error ? `message: ${unlinked.error}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
    }
  }

  const sessionOk = check(
    { syncInfo, wsState: wsResult.state, gameplayStarted, videoFinishedOk },
    {
      "game sync start ok": () => syncInfo && syncInfo.ok,
      "game pairing confirmed": () =>
        wsResult.state && wsResult.state.pairingAccepted === true,
      "game video sync notification or rpc": () =>
        (wsResult.state && wsResult.state.videoSyncStart === true) ||
        (syncInfo && syncInfo.ok),
      "game completed gameplay window": () => gameplayStarted === true,
      "gameplay finished notification ok": () => videoFinishedOk === true,
    },
  );

  activePlayers.add(-1);
  activeTvSessions.add(-1);
  activeGames.add(-1);

  if (sessionOk) {
    markState(life, SessionState.COMPLETED);
    logSessionComplete(life);
    gameCompleted.add(1);
    gameCompletionRate.add(true);
  } else {
    endFailed(life, "gameplay_incomplete", {
      rpc: "lifecycle",
      message: "Session connected but gameplay/sync checks failed",
    });
  }

  return {
    ok: sessionOk,
    sessionKey: session.sessionKey,
    videoId,
    playerCount,
    syncInfo,
    wsState: wsResult.state,
    gameplayFinished,
    life,
  };
}
