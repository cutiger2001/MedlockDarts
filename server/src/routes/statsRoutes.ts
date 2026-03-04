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

// Player season history
router.get('/players/:id/season-history', asyncHandler(async (req, res) => {
  const history = await statsService.getPlayerSeasonHistory(Number(req.params.id));
  res.json(history);
}));

// Team stats
router.get('/teams/:teamSeasonId', asyncHandler(async (req, res) => {
  const stats = await statsService.getTeamStats(Number(req.params.teamSeasonId));
  if (!stats) throw new AppError(404, 'Team-Season not found');
  res.json(stats);
}));

// Season leaderboard (player)
router.get('/seasons/:id/leaderboard', asyncHandler(async (req, res) => {
  const leaderboard = await statsService.getSeasonLeaderboard(Number(req.params.id));
  res.json(leaderboard);
}));

// Season team leaderboard
router.get('/seasons/:id/team-leaderboard', asyncHandler(async (req, res) => {
  const leaderboard = await statsService.getSeasonTeamLeaderboard(Number(req.params.id));
  res.json(leaderboard);
}));

// Highest IN scores (optional seasonId filter)
router.get('/records/highest-in', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const result = await statsService.getHighestInScores(20, seasonId);
  res.json(result);
}));

// Highest OUT scores (optional seasonId filter)
router.get('/records/highest-out', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const result = await statsService.getHighestOutScores(20, seasonId);
  res.json(result);
}));

// Top team game averages for X01 (optional seasonId filter)
router.get('/records/top-team-avg/:target', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const result = await statsService.getTopTeamGameAverages(Number(req.params.target), 10, seasonId);
  res.json(result);
}));

// Top team game MPR for Cricket (optional seasonId filter)
router.get('/records/top-team-mpr', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const result = await statsService.getTopTeamGameMPR(10, seasonId);
  res.json(result);
}));

// Top individual game averages for X01 (optional seasonId filter)
router.get('/records/top-individual-avg/:target', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const result = await statsService.getTopIndividualGameAverages(Number(req.params.target), 10, seasonId);
  res.json(result);
}));

// Top individual game MPR for Cricket (optional seasonId filter)
router.get('/records/top-individual-mpr', asyncHandler(async (req, res) => {
  const seasonId = req.query.seasonId ? Number(req.query.seasonId) : undefined;
  const result = await statsService.getTopIndividualGameMPR(10, seasonId);
  res.json(result);
}));

// Hall of Fame (all-time records)
router.get('/hall-of-fame', asyncHandler(async (_req, res) => {
  const result = await statsService.getHallOfFame();
  res.json(result);
}));

export { router as statsRoutes };
