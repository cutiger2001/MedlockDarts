import express from 'express';
import cors from 'cors';
import path from 'path';
import config from './config';
import { requestLogger } from './middleware/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { playerRoutes } from './routes/playerRoutes';
import { teamRoutes } from './routes/teamRoutes';
import { seasonRoutes } from './routes/seasonRoutes';
import { matchRoutes } from './routes/matchRoutes';
import { gameRoutes } from './routes/gameRoutes';
import { statsRoutes } from './routes/statsRoutes';

const app = express();

// Middleware
app.use(cors({ origin: config.cors.origin }));
app.use(express.json({ limit: '10mb' })); // large limit for base64 images
app.use(requestLogger);

// API Routes
app.use('/api/players', playerRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/seasons', seasonRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/stats', statsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve built client in production
if (config.server.nodeEnv === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  // SPA fallback: any non-API route serves index.html
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handling (must come after SPA fallback)
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
