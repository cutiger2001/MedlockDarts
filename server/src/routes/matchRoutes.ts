import { Router, Request, Response, NextFunction } from 'express';
import { matchService } from '../services/matchService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// Live matches (all in-progress)
router.get('/live', asyncHandler(async (_req, res) => {
  const matches = await matchService.getLive();
  res.json(matches);
}));

router.get('/', asyncHandler(async (req, res) => {
  const seasonId = Number(req.query.seasonId);
  if (!seasonId) throw new AppError(400, 'seasonId query parameter is required');
  const matches = await matchService.getBySeason(seasonId);
  res.json(matches);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const match = await matchService.getById(Number(req.params.id));
  if (!match) throw new AppError(404, 'Match not found');
  res.json(match);
}));

router.put('/:id/status', asyncHandler(async (req, res) => {
  const { Status, WinnerTeamSeasonID } = req.body;
  if (!Status) throw new AppError(400, 'Status is required');
  const match = await matchService.updateStatus(Number(req.params.id), Status, WinnerTeamSeasonID);
  res.json(match);
}));

router.post('/:id/coin-toss', asyncHandler(async (req, res) => {
  const result = await matchService.coinToss(Number(req.params.id));
  res.json(result);
}));

router.post('/:id/coin-toss-winner', asyncHandler(async (req, res) => {
  const { TeamSeasonID } = req.body;
  if (!TeamSeasonID) throw new AppError(400, 'TeamSeasonID is required');
  await matchService.setCoinTossWinner(Number(req.params.id), TeamSeasonID);
  res.json({ success: true });
}));

export { router as matchRoutes };
