import { sleep } from "k6";
import { check } from "k6";
import { config } from "../config.js";
import { authenticateDevice } from "../helpers/auth.js";
import { fetchDefaultVideoId } from "../helpers/nakama.js";
import {
  activeGames,
  activePlayers,
  activeTvSessions,
  gameCompleted,
  gameCompletionRate,
  gameFailed,
  videoSelectionDuration,
} from "../helpers/metrics.js";
import {
  buildFinalResults,
  fetchServerTime,
  generateSyncStart,
  pulseFrameSync,
  registerFrameTimeline,
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

/**
 * One k6 VU = exactly ONE game session:
 *   1 TV  (auth + WebSocket + pairing host)
 *   1 Mobile player (auth + gameplay RPCs)
 *
 * 50 "users" in load terms = 25 VUs = 25 TV + 25 mobile (1:1).
 */
export function runFullGameSession(vu, iter) {
  const session = createSessionContext(vu, iter);
  const playerCount = 1;

  activeTvSessions.add(1);
  activeGames.add(1);
  activePlayers.add(1);

  sleep(randomJitter(config.jitterAuthMaxMs) / 1000);

  const tvAuth = authenticateDevice("tv", session.tvAuthDeviceId);
  if (!tvAuth.ok) {
    gameFailed.add(1);
    gameCompletionRate.add(false);
    activeTvSessions.add(-1);
    activeGames.add(-1);
    activePlayers.add(-1);
    return { ok: false, stage: "tv_auth", sessionKey: session.sessionKey };
  }
  tvAuth.linkDeviceId = session.tvLinkDeviceId;

  const mobileAuth = authenticateDevice("mobile", session.mobileDeviceId);
  if (!mobileAuth.ok) {
    gameFailed.add(1);
    gameCompletionRate.add(false);
    activeTvSessions.add(-1);
    activeGames.add(-1);
    activePlayers.add(-1);
    return { ok: false, stage: "mobile_auth", sessionKey: session.sessionKey };
  }

  sleep(randomJitter(config.jitterPairingMaxMs) / 1000);

  const pairing = runPairingFlow(tvAuth, [mobileAuth], session.tvLinkDeviceId);
  if (!pairing.ok) {
    gameFailed.add(1);
    gameCompletionRate.add(false);
    activePlayers.add(-1);
    activeTvSessions.add(-1);
    activeGames.add(-1);
    return { ok: false, stage: "pairing", detail: pairing, sessionKey: session.sessionKey };
  }

  sleep(randomJitter(config.jitterVideoMaxMs) / 1000);

  const videoStart = Date.now();
  const videoPick = fetchDefaultVideoId(tvAuth.token);
  const videoId = videoPick.videoId;
  videoSelectionDuration.add(Date.now() - videoStart);

  const mobilePlayer = {
    token: mobileAuth.token,
    deviceId: mobileAuth.deviceId,
    subject: session.mobileSubject,
  };

  const videoFlow = sendVideoSelectionFlow(
    tvAuth.token,
    session.tvSubject,
    videoId,
    playerCount,
  );
  if (!videoFlow.ok) {
    gameFailed.add(1);
    gameCompletionRate.add(false);
    activePlayers.add(-1);
    activeTvSessions.add(-1);
    activeGames.add(-1);
    return { ok: false, stage: "video_selection", detail: videoFlow };
  }

  const unityReady = sendMobileVideoUnityReady(
    mobilePlayer.token,
    mobilePlayer.subject,
    videoId,
  );
  if (!unityReady.ok) {
    gameFailed.add(1);
    gameCompletionRate.add(false);
    activePlayers.add(-1);
    activeTvSessions.add(-1);
    activeGames.add(-1);
    return { ok: false, stage: "unity_ready" };
  }

  registerFrameTimeline(mobilePlayer.token, videoId);

  const wsDurationMs = config.countdownMs + config.videoDurationMs + 15000;

  let syncInfo = null;
  let liveScore = 0;
  let lastSequence = 0;
  let gameplayStarted = false;
  let gameplayEnded = false;

  const wsResult = connectNakamaWebSocket({
    token: tvAuth.token,
    durationMs: wsDurationMs,
    onOpen: function (socket, _state) {
      syncInfo = generateSyncStart(mobilePlayer.token, videoId);
      if (!syncInfo.ok) {
        socket.close();
        return;
      }

      const waitCountdownMs = Math.max(1000, syncInfo.startAt - Date.now());

      socket.setTimeout(function () {
        gameplayStarted = true;

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
    },
  });

  if (!wsResult.connected) {
    gameFailed.add(1);
    gameCompletionRate.add(false);
    activePlayers.add(-1);
    activeTvSessions.add(-1);
    activeGames.add(-1);
    return { ok: false, stage: "websocket" };
  }

  const sessionOk = check(
    { syncInfo, wsState: wsResult.state, gameplayStarted },
    {
      "game sync start ok": () => syncInfo && syncInfo.ok,
      "game video sync notification or rpc": () =>
        (wsResult.state && wsResult.state.videoSyncStart === true) ||
        (syncInfo && syncInfo.ok),
      "game completed gameplay window": () => gameplayStarted === true,
    },
  );

  const finalResults = buildFinalResults(
    [mobilePlayer],
    videoId,
    playerCount,
    [liveScore],
  );

  if (!config.skipCleanup) {
    sendSessionEnded(tvAuth.token, session.tvSubject, "k6-test-complete");
    unlinkDevice(mobilePlayer.token, session.tvLinkDeviceId);
  }

  activePlayers.add(-1);
  activeTvSessions.add(-1);
  activeGames.add(-1);

  if (sessionOk) {
    gameCompleted.add(1);
    gameCompletionRate.add(true);
  } else {
    gameFailed.add(1);
    gameCompletionRate.add(false);
  }

  return {
    ok: sessionOk,
    sessionKey: session.sessionKey,
    videoId,
    playerCount,
    syncInfo,
    wsState: wsResult.state,
    finalResults,
  };
}
