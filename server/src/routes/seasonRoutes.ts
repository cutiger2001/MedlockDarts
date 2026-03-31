import { Router, Request, Response, NextFunction } from 'express';
import { seasonService } from '../services/seasonService';
import { AppError } from '../middleware/errorHandler';
import config from '../config';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

function requireSetupPassword(req: Request) {
  const expected = config.league.setupPassword;
  if (!expected) return;
  if (req.body?.setupPassword !== expected) {
    throw new AppError(403, 'Invalid setup password');
  }
}

// Seasons CRUD
router.get('/', asyncHandler(async (_req, res) => {
  const seasons = await seasonService.getAll();
  res.json(seasons);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const season = await seasonService.getById(Number(req.params.id));
  if (!season) throw new AppError(404, 'Season not found');
  res.json(season);
}));

router.post('/', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const { SeasonName, StartDate, EndDate } = req.body;
  if (!SeasonName) throw new AppError(400, 'SeasonName is required');
  const season = await seasonService.create({ SeasonName, StartDate, EndDate });
  res.status(201).json(season);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const season = await seasonService.update(Number(req.params.id), req.body);
  if (!season) throw new AppError(404, 'Season not found');
  res.json(season);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  await seasonService.deleteSeason(Number(req.params.id));
  res.json({ success: true });
}));

// Team-Season management
router.get('/:id/teams', asyncHandler(async (req, res) => {
  const teams = await seasonService.getTeamSeasons(Number(req.params.id));
  res.json(teams);
}));

router.post('/:id/teams', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const { TeamID } = req.body;
  if (!TeamID) throw new AppError(400, 'TeamID is required');
  const ts = await seasonService.addTeamToSeason(Number(req.params.id), TeamID);
  res.status(201).json(ts);
}));

router.delete('/:seasonId/teams/:teamId', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const success = await seasonService.removeTeamFromSeason(
    Number(req.params.seasonId),
    Number(req.params.teamId)
  );
  if (!success) throw new AppError(404, 'Team-Season not found');
  res.json({ success: true });
}));

// Update team-season settings (color, nickname)
router.put('/:seasonId/teams/:teamSeasonId', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const { TeamColor, TeamNickname } = req.body;
  const updated = await seasonService.updateTeamSeason(
    Number(req.params.teamSeasonId),
    { TeamColor, TeamNickname }
  );
  if (!updated) throw new AppError(404, 'TeamSeason not found');
  res.json(updated);
}));

// Schedule generation
router.post('/:id/schedule', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const matchCount = await seasonService.generateSchedule(Number(req.params.id), { preserveMakeUpMatches: true });
  res.json({ matchesCreated: matchCount });
}));

router.post('/:id/make-up-round', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const { MatchDate } = req.body;
  if (!MatchDate) {
    throw new AppError(400, 'MatchDate is required');
  }

  const match = await seasonService.createMakeUpRound(Number(req.params.id), {
    matchDate: MatchDate,
  });
  res.status(201).json(match);
}));

router.put('/:id/schedule-dates', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const { MatchIDs, MatchDate } = req.body;
  if (!Array.isArray(MatchIDs) || MatchIDs.length === 0) {
    throw new AppError(400, 'MatchIDs array is required');
  }
  if (!MatchDate) {
    throw new AppError(400, 'MatchDate is required');
  }

  const updated = await seasonService.updateScheduleDates(
    Number(req.params.id),
    MatchIDs.map((value: unknown) => Number(value)),
    MatchDate,
  );
  res.json({ updated });
}));

// Playoff generation
router.post('/:id/playoffs', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  await seasonService.generatePlayoffs(Number(req.params.id));
  res.json({ success: true });
}));

// Game format configuration
router.get('/:id/game-formats', asyncHandler(async (req, res) => {
  const formats = await seasonService.getGameFormats(Number(req.params.id));
  res.json(formats);
}));

router.put('/:id/game-formats', asyncHandler(async (req, res) => {
  requireSetupPassword(req);
  const { formats } = req.body;
  if (!formats || !Array.isArray(formats)) throw new AppError(400, 'formats array is required');
  const result = await seasonService.setGameFormats(Number(req.params.id), formats);
  res.json(result);
}));

export { router as seasonRoutes };
