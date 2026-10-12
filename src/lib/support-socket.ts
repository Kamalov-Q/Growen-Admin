import { io, Socket } from "socket.io-client";
import { API_URL, refreshSession } from "./api";
import { sessionStore } from "./session";

/**
 * The `/support` namespace. The server puts every admin in one duty room, so
 * a reply from a colleague and a new question from a customer both land here
 * without this dashboard asking for anything.
 */
let socket: Socket | null = null;
let refreshing = false;

export function getSupportSocket(): Socket {
  if (socket) return socket;

  socket = io(`${API_URL}/support`, {
    transports: ["websocket"],
    // Read per connect, so a reconnect after a refresh carries the new token.
    auth: (cb) => cb({ token: sessionStore.getAccessToken() }),
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  // A dashboard is left open for hours, so the access token expires under it.
  // Without this the socket stays "connected" to nothing and the desk quietly
  // stops seeing new questions — the same repair the app's socket does.
  socket.on("auth:expired", () => void refreshAndReconnect());
  socket.on("connect_error", (err: Error) => {
    if (/auth|unauthorized|jwt/i.test(err.message)) void refreshAndReconnect();
  });

  return socket;
}

async function refreshAndReconnect() {
  if (refreshing || !socket) return;
  refreshing = true;
  try {
    if (await refreshSession()) {
      socket.disconnect();
      socket.connect();
    }
  } finally {
    refreshing = false;
  }
}
