import { Counter, Gauge, Rate, Trend } from "k6/metrics";

export const authDuration = new Trend("auth_duration", true);
export const websocketConnectDuration = new Trend("websocket_connect_duration", true);
export const pairingDuration = new Trend("pairing_duration", true);
export const videoSelectionDuration = new Trend("video_selection_duration", true);
export const syncStartDuration = new Trend("sync_start_duration", true);
export const scoreRpcDuration = new Trend("score_rpc_duration", true);
export const frameSyncDuration = new Trend("frame_sync_duration", true);
export const serverTimeDuration = new Trend("server_time_duration", true);

export const authSuccess = new Counter("auth_success");
export const authFailure = new Counter("auth_failure");
export const websocketSuccess = new Counter("websocket_success");
export const websocketFailure = new Counter("websocket_failure");

export const pairingAttempts = new Counter("pairing_attempts");
export const pairingCompleteSuccess = new Counter("pairing_complete_success");
export const pairingCompleteFailure = new Counter("pairing_complete_failure");
export const pairingGenerateSuccess = new Counter("pairing_generate_success");
export const pairingGenerateFailure = new Counter("pairing_generate_failure");
export const pairingVerifySuccess = new Counter("pairing_verify_success");
export const pairingVerifyFailure = new Counter("pairing_verify_failure");

/** @deprecated use pairingCompleteSuccess — kept so old summaries still resolve */
export const pairingSuccess = pairingCompleteSuccess;
export const pairingFailure = pairingCompleteFailure;

export const syncSuccess = new Counter("sync_success");
export const syncFailure = new Counter("sync_failure");
export const scoreSuccess = new Counter("score_success");
export const scoreFailure = new Counter("score_failure");
export const frameSyncSuccess = new Counter("frame_sync_success");
export const frameSyncFailure = new Counter("frame_sync_failure");
export const gameAttempted = new Counter("game_attempted");
export const gameStarted = new Counter("game_started");
export const gameCompleted = new Counter("game_completed");
export const gameFailed = new Counter("game_failed");
export const rpcErrors = new Counter("rpc_errors");
export const leaderboardWrites = new Counter("leaderboard_writes");
export const leaderboardErrors = new Counter("leaderboard_errors");
export const websocketDisconnects = new Counter("websocket_disconnects");
export const cleanupSuccess = new Counter("cleanup_success");
export const cleanupFailure = new Counter("cleanup_failure");

export const pairingSuccessRate = new Rate("pairing_success_rate");
export const gameCompletionRate = new Rate("game_completion_rate");
export const websocketSuccessRate = new Rate("websocket_success_rate");
export const syncSuccessRate = new Rate("sync_success_rate");
export const cleanupSuccessRate = new Rate("cleanup_success_rate");

export const activePlayers = new Gauge("active_players");
export const activeTvSessions = new Gauge("active_tv_sessions");
export const activeGames = new Gauge("active_games");

export const scoreMessagesSent = new Counter("score_messages_sent");
export const frameSyncPulsesSent = new Counter("frame_sync_pulses_sent");
export const notificationsReceived = new Counter("notifications_received");
export const websocketMessagesReceived = new Counter("websocket_messages_received");

export const videoSyncStartReceived = new Counter("video_sync_start_received");
export const frameSyncNotificationsReceived = new Counter("frame_sync_notifications_received");
export const scoreNotificationsReceived = new Counter("score_notifications_received");
export const videoFinishedNotificationsReceived = new Counter(
  "video_finished_notifications_received",
);
export const sessionEndedNotificationsReceived = new Counter(
  "session_ended_notifications_received",
);
export const playbackCompletedSent = new Counter("playback_completed_sent");
