import http from "k6/http";
import ws from "k6/ws";
import encoding from "k6/encoding";
import { check, fail, sleep } from "k6";

// ============================================================
// Nakama Server
// ============================================================

const HOST = "85.198.11.216";
const PORT = "7350";

const HTTP_BASE = `http://${HOST}:${PORT}`;
const WS_BASE = `ws://${HOST}:${PORT}`;

// ============================================================
// Nakama Authentication
// ============================================================
//
// IMPORTANT:
//
// /v2/account/authenticate/device
// uses Nakama socket.server_key.
//
// This is NOT NAKAMA_HTTP_KEY.
//
// Server:
//   NAKAMA_SOCKET_SERVER_KEY
//   = e6f10428957017d3dfff463c7b81c5b3
//
// Basic Auth format:
//
//   server_key:
//
// k6 generates Base64 automatically.
// ============================================================

const NAKAMA_SERVER_KEY =
    "e6f10428957017d3dfff463c7b81c5b3";

const AUTH_HEADER =
    "Basic " +
    encoding.b64encode(`${NAKAMA_SERVER_KEY}:`);

// ============================================================
// k6 configuration
// ============================================================

export const options = {

    stages: [

        // ----------------------------------------------------
        // Ramp up
        // 0 -> 40 clients in 10 seconds
        // ----------------------------------------------------

        {
            duration: "10s",
            target: 40,
        },

        // ----------------------------------------------------
        // Stable load
        // Keep 40 concurrent clients for 60 seconds
        // ----------------------------------------------------

        {
            duration: "60s",
            target: 40,
        },

        // ----------------------------------------------------
        // Ramp down
        // 40 -> 0 clients in 10 seconds
        // ----------------------------------------------------

        {
            duration: "10s",
            target: 0,
        },
    ],

    thresholds: {

        // Less than 5% HTTP requests may fail.
        http_req_failed: [
            "rate<0.05",
        ],

        // At least 95% of checks must pass.
        checks: [
            "rate>0.95",
        ],
    },
};

// ============================================================
// Virtual User
// ============================================================

export default function () {

    // ========================================================
    // 1. Authenticate Device
    // ========================================================

    const authUrl =
        `${HTTP_BASE}/v2/account/authenticate/device?create=true`;

    // Unique device ID for every VU.
    //
    // __VU is stable for the VU.
    // Date.now() prevents collisions between iterations.
    const deviceId =
        `k6-client-${__VU}-${Date.now()}`;

    const authPayload =
        JSON.stringify({
            id: deviceId,
            vars: {},
        });

    const authResponse =
        http.post(
            authUrl,
            authPayload,
            {
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "Authorization": AUTH_HEADER,
                },

                // Optional timeout to prevent a stuck
                // authentication request from hanging forever.
                timeout: "10s",
            }
        );

    // ========================================================
    // Validate Authentication
    // ========================================================

    const authOk =
        check(
            authResponse,
            {

                "auth status 200":
                    (r) =>
                        r.status === 200,

                "auth has token":
                    (r) => {

                        try {

                            const body =
                                JSON.parse(r.body);

                            return !!body.token;

                        } catch (e) {

                            return false;
                        }
                    },
            }
        );

    // ========================================================
    // Authentication Failed
    // ========================================================

    if (!authOk) {

        console.error(
            `VU ${__VU}: authentication FAILED`
        );

        console.error(
            `HTTP status: ${authResponse.status}`
        );

        console.error(
            `Response: ${authResponse.body}`
        );

        fail(
            "Nakama authentication failed"
        );

        return;
    }

    // ========================================================
    // Extract Token
    // ========================================================

    let authData;

    try {

        authData =
            JSON.parse(authResponse.body);

    } catch (e) {

        console.error(
            `VU ${__VU}: invalid authentication JSON`
        );

        fail(
            "Invalid Nakama authentication response"
        );

        return;
    }

    const token =
        authData.token;

    if (!token) {

        console.error(
            `VU ${__VU}: token missing`
        );

        fail(
            "Nakama token missing"
        );

        return;
    }

    console.log(
        `VU ${__VU}: authenticated`
    );

    // ========================================================
    // 2. Connect to Nakama WebSocket
    // ========================================================

    const wsUrl =
        `${WS_BASE}/ws` +
        `?lang=en` +
        `&status=true` +
        `&token=${encodeURIComponent(token)}`;

    const wsResponse =
        ws.connect(
            wsUrl,
            {
                timeout: "10s",
            },
            function (socket) {

                // =================================================
                // WebSocket OPEN
                // =================================================

                socket.on(
                    "open",
                    function () {

                        console.log(
                            `VU ${__VU}: WebSocket CONNECTED`
                        );

                        // ------------------------------------------------
                        // Keep WebSocket alive
                        // ------------------------------------------------

                        socket.setInterval(
                            function () {

                                socket.ping();

                            },
                            5000
                        );
                    }
                );

                // =================================================
                // WebSocket PONG
                // =================================================

                socket.on(
                    "pong",
                    function () {

                        // Connection is alive.

                    }
                );

                // =================================================
                // WebSocket MESSAGE
                // =================================================

                socket.on(
                    "message",
                    function (message) {

                        // ------------------------------------------------
                        // Basic connection test:
                        // We intentionally don't process Nakama
                        // application messages yet.
                        // ------------------------------------------------

                    }
                );

                // =================================================
                // WebSocket ERROR
                // =================================================

                socket.on(
                    "error",
                    function (error) {

                        console.error(
                            `VU ${__VU}: WebSocket ERROR`
                        );

                        console.error(
                            error
                        );
                    }
                );

                // =================================================
                // WebSocket CLOSE
                // =================================================

                socket.on(
                    "close",
                    function () {

                        console.log(
                            `VU ${__VU}: WebSocket CLOSED`
                        );
                    }
                );

                // =================================================
                // Keep Connection Open
                // =================================================
                //
                // The load stage keeps VUs active for 60 seconds.
                // This timeout closes the socket after 60 seconds.
                //
                // =================================================

                socket.setTimeout(
                    function () {

                        socket.close();

                    },
                    60000
                );
            }
        );

    // ========================================================
    // 3. Verify WebSocket Connection
    // ========================================================

    const connected =
        check(
            wsResponse,
            {

                "WebSocket connected (101)":
                    (r) =>
                        r &&
                        r.status === 101,

            }
        );

    // ========================================================
    // WebSocket Connection Failed
    // ========================================================

    if (!connected) {

        console.error(
            `VU ${__VU}: WebSocket connection FAILED`
        );

        if (wsResponse) {

            console.error(
                `WebSocket HTTP status: ${wsResponse.status}`
            );

            console.error(
                `WebSocket body: ${wsResponse.body || ""}`
            );
        }
    }

    // ========================================================
    // Prevent immediate iteration restart
    // ========================================================

    sleep(1);
}