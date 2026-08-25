import ws from "k6/ws";
import { check } from "k6";
import { config } from "../config.js";
import {
  frameSyncNotificationsReceived,
  notificationsReceived,
  scoreNotificationsReceived,
  videoSyncStartReceived,
  websocketConnectDuration,
  websocketDisconnects,
  websocketFailure,
  websocketMessagesReceived,
  websocketSuccess,
  websocketSuccessRate,
} from "./metrics.js";
import {
  notificationCode,
  parseNotificationContent,
  parseNotificationsMessage,
} from "./utils.js";
import { NOTIFICATION_CODES } from "./pairing.js";

/**
 * Connect Nakama WebSocket and track notifications.
 * @param {object} params
 * @param {string} params.token
 * @param {number} params.durationMs
 * @param {function} params.onOpen
 * @param {function} [params.onNotification]
 * @param {object} [params.state] mutable state bag shared with callbacks
 */
export function connectNakamaWebSocket(params) {
  const url =
    `${config.wsBase}/ws?lang=en&status=true&token=${encodeURIComponent(params.token)}`;

  const start = Date.now();
  const state = params.state || {
    opened: false,
    videoSyncStart: false,
    notifications: 0,
    frameSyncPackets: 0,
    scorePackets: 0,
    pairingAccepted: false,
  };

  const res = ws.connect(
    url,
    { tags: { phase: "websocket" }, timeout: config.wsTimeout },
    function (socket) {
      socket.on("open", function () {
        state.opened = true;
        websocketConnectDuration.add(Date.now() - start);
        websocketSuccess.add(1);
        websocketSuccessRate.add(true);

        socket.setInterval(function () {
          socket.ping();
        }, config.wsPingIntervalMs);

        if (params.onOpen) {
          params.onOpen(socket, state);
        }
      });

      socket.on("message", function (message) {
        websocketMessagesReceived.add(1);
        const items = parseNotificationsMessage(message);
        if (items.length === 0) return;

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          notificationsReceived.add(1);
          state.notifications += 1;

          const code = notificationCode(item);
          const subject = item.subject != null ? String(item.subject) : "";
          const content = parseNotificationContent(item.content);

          if (code === NOTIFICATION_CODES.ReceiveAcceptedLinkLoginCode) {
            state.pairingAccepted = true;
          }
          if (
            code === NOTIFICATION_CODES.VideoSyncStart ||
            subject === "VideoSyncStart"
          ) {
            state.videoSyncStart = true;
            state.syncStartAt =
              content.startAt != null
                ? Number(content.startAt)
                : content.start_at != null
                  ? Number(content.start_at)
                  : 0;
            state.syncSessionId = content.syncSessionId || content.sync_session_id || "";
            videoSyncStartReceived.add(1);
          }
          if (code === NOTIFICATION_CODES.FrameSync) {
            state.frameSyncPackets += 1;
            frameSyncNotificationsReceived.add(1);
          }
          if (code === NOTIFICATION_CODES.OnPlayerTotalScoreChanged) {
            state.scorePackets += 1;
            scoreNotificationsReceived.add(1);
          }

          if (params.onNotification) {
            params.onNotification(item, content, state);
          }
        }
      });

      socket.on("error", function (_error) {
        if (!state.opened) {
          websocketFailure.add(1);
          websocketSuccessRate.add(false);
        }
      });

      socket.on("close", function () {
        websocketDisconnects.add(1);
      });

      socket.setTimeout(function () {
        socket.close();
      }, params.durationMs);
    },
  );

  const connected = check(res, {
    "websocket connected 101": (r) => r && r.status === 101,
  });

  if (!connected) {
    websocketFailure.add(1);
    websocketSuccessRate.add(false);
  }

  return { response: res, connected, state };
}
