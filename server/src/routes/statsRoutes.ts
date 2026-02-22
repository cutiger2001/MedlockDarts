import { Router, Request, Response, NextFunction } from 'express';
import { statsService } from '../services/statsService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// Player stats (optional seasonId filter)
router.get('/players/:id', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const stats = await statsService.getPlayerStats(Number(req.params.id), seasonId);
  if (!stats) throw new AppError(404, 'Player not found');
  res.json(stats);
}));

// Player game log (optional seasonId filter)
router.get('/players/:id/games', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const log = await statsService.getPlayerGameLog(Number(req.params.id), seasonId);
  res.json(log);
}));

// Team stats
router.get('/teams/:teamSeasonId', asyncHandler(async (req, res) => {
  const stats = await statsService.getTeamStats(Number(req.params.teamSeasonId));
  if (!stats) throw new AppError(404, 'Team-Season not found');
  res.json(stats);
}));

// Season leaderboard
router.get('/seasons/:id/leaderboard', asyncHandler(async (req, res) => {
  const leaderboard = await statsService.getSeasonLeaderboard(Number(req.params.id));
  res.json(leaderboard);
}));

export { router as statsRoutes };
