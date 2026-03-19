let ioRef = null;
const userToSockets = new Map();

export function setSocketServer(io) {
  ioRef = io;
}

export function registerUserSocket(userId, socketId) {
  if (!userToSockets.has(userId)) {
    userToSockets.set(userId, new Set());
  }
  userToSockets.get(userId).add(socketId);
}

export function unregisterUserSocket(userId, socketId) {
  const sockets = userToSockets.get(userId);
  if (!sockets) {
    return;
  }

  sockets.delete(socketId);
  if (sockets.size === 0) {
    userToSockets.delete(userId);
  }
}

export function disconnectUserSockets(userId, reason = 'logout') {
  if (!ioRef) {
    return 0;
  }

  const sockets = userToSockets.get(userId);
  if (!sockets) {
    return 0;
  }

  let disconnected = 0;
  for (const socketId of sockets) {
    const socket = ioRef.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('session:ended', { reason });
      socket.disconnect(true);
      disconnected += 1;
    }
  }

  userToSockets.delete(userId);
  return disconnected;
}

export function emitToUserSockets(userId, event, payload) {
  if (!ioRef) {
    return 0;
  }

  const sockets = userToSockets.get(userId);
  if (!sockets) {
    return 0;
  }

  let emitted = 0;
  for (const socketId of sockets) {
    const socket = ioRef.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, payload);
      emitted += 1;
    }
  }

  return emitted;
}

export function emitToRoom(room, event, payload) {
  if (!ioRef) {
    return false;
  }

  ioRef.to(room).emit(event, payload);
  return true;
}
