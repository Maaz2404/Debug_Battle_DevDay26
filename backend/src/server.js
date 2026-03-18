import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { createSocketServer } from './socket/index.js';
import { startCompileWorker } from './workers/compileWorker.js';

const app = express();
const server = createServer(app);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prototypeDir = path.resolve(__dirname, '../prototype');

app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.status(200).json({ data: { status: 'ok' } });
});

app.use('/prototype', express.static(prototypeDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jsx')) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    }
  },
}));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

createSocketServer(server);
startCompileWorker();

server.listen(env.PORT, () => {
  console.log(`server running at http://localhost:${env.PORT}`);
});