import { io, Socket } from "socket.io-client";
import { API_URL } from "./api";
import { sessionStore } from "./session";

/**
 * The `/support` namespace. The server puts every admin in one duty room, so
 * a reply from a colleague and a new question from a customer both land here
 * without this dashboard asking for anything.
 */
let socket: Socket | null = null;

export function getSupportSocket(): Socket {
  if (socket) return socket;

  socket = io(`${API_URL}/support`, {
    transports: ["websocket"],
    auth: (cb) => cb({ token: sessionStore.getAccessToken() }),
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  return socket;
}
