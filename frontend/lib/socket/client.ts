import { io, type Socket } from "socket.io-client";

export type SocketEventName =
  | "competition:state"
  | "round:start"
  | "question:next"
  | "question:gap"
  | "round:paused"
  | "round:resumed"
  | "round:end"
  | "run:result"
  | "submission:result"
  | "leaderboard:update"
  | "session:ended";

const fallbackSocketUrl = "http://localhost:3000";
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || fallbackSocketUrl;

let socketRef: Socket | null = null;
let tokenRef: string | null = null;

function ensureSocket(token: string) {
  if (socketRef && tokenRef === token) {
    return socketRef;
  }

  if (socketRef) {
    socketRef.disconnect();
    socketRef = null;
  }

  socketRef = io(socketUrl, {
    transports: ["websocket", "polling"],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });
  tokenRef = token;

  return socketRef;
}

export function connectCompetitionSocket(token: string) {
  return ensureSocket(token);
}

export function onSocketEvent<T>(event: SocketEventName, handler: (payload: T) => void) {
  if (!socketRef) {
    return () => undefined;
  }

  socketRef.on(event, handler as (...args: unknown[]) => void);
  return () => {
    socketRef?.off(event, handler as (...args: unknown[]) => void);
  };
}

export function onSocketLifecycle(handlers: {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReconnecting?: () => void;
}) {
  if (!socketRef) {
    return () => undefined;
  }

  const connected = () => handlers.onConnected?.();
  const disconnected = () => handlers.onDisconnected?.();
  const reconnecting = () => handlers.onReconnecting?.();

  socketRef.on("connect", connected);
  socketRef.on("disconnect", disconnected);
  socketRef.on("reconnect_attempt", reconnecting);

  return () => {
    socketRef?.off("connect", connected);
    socketRef?.off("disconnect", disconnected);
    socketRef?.off("reconnect_attempt", reconnecting);
  };
}

export function waitForSocketEvent<T>(
  event: SocketEventName,
  predicate: (payload: T) => boolean,
  timeoutMs = 25000,
): Promise<T> {
  const socket = socketRef;
  if (!socket) {
    return Promise.reject(new Error("Socket is not connected"));
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      socket.off(event, listener as (...args: unknown[]) => void);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const listener = (payload: T) => {
      if (!predicate(payload)) {
        return;
      }
      window.clearTimeout(timeout);
      socket.off(event, listener as (...args: unknown[]) => void);
      resolve(payload);
    };

    socket.on(event, listener as (...args: unknown[]) => void);
  });
}

export function disconnectCompetitionSocket() {
  if (!socketRef) {
    return;
  }

  socketRef.disconnect();
  socketRef = null;
  tokenRef = null;
}
