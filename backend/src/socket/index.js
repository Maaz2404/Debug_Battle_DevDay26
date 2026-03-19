import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getCompetitionState } from '../services/competitionStateService.js';
import { registerUserSocket, setSocketServer, unregisterUserSocket } from './registry.js';

function extractSocketToken(socket) {
  if (typeof socket.handshake.auth?.token === 'string') {
    return socket.handshake.auth.token;
  }

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  return null;
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS.length === 1 ? env.ALLOWED_ORIGINS[0] : env.ALLOWED_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token) {
        return next(new Error('Missing socket auth token'));
      }

      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data?.user) {
        return next(new Error('Invalid socket auth token'));
      }

      const userId = data.user.id;
      const { data: team } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('auth_user_id', userId)
        .maybeSingle();

      socket.data.auth = {
        sub: userId,
        user_id: userId,
        team_id: team?.id || null,
        team_name: team?.name || null,
        role: 'participant',
        competition_id: env.COMPETITION_ID,
      };

      return next();
    } catch (error) {
      return next(new Error('Invalid socket auth token'));
    }
  });

  io.on('connection', async (socket) => {
    const auth = socket.data.auth;
    const principalId = auth.user_id || auth.team_id;
    const room = `comp:${env.COMPETITION_ID}`;

    if (!principalId) {
      socket.disconnect(true);
      return;
    }

    registerUserSocket(principalId, socket.id);
    socket.join(room);

    const state = await getCompetitionState(env.COMPETITION_ID);
    socket.emit('competition:state', state);

    socket.on('disconnect', () => {
      unregisterUserSocket(principalId, socket.id);
    });
  });

  setSocketServer(io);
  return io;
}
