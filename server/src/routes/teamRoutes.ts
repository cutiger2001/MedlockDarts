import { Router, Request, Response, NextFunction } from 'express';
import { teamService } from '../services/teamService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

router.get('/', asyncHandler(async (_req, res) => {
  const teams = await teamService.getAll();
  res.json(teams);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const team = await teamService.getById(Number(req.params.id));
  if (!team) throw new AppError(404, 'Team not found');
  res.json(team);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { TeamName, Player1ID, Player2ID } = req.body;
  if (!TeamName || !Player1ID || !Player2ID) {
    throw new AppError(400, 'TeamName, Player1ID, and Player2ID are required');
  }
  if (Player1ID === Player2ID) {
    throw new AppError(400, 'A team must have two different players');
  }
  const team = await teamService.create({ TeamName, Player1ID, Player2ID });
  res.status(201).json(team);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const team = await teamService.update(Number(req.params.id), req.body);
  if (!team) throw new AppError(404, 'Team not found');
  res.json(team);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const success = await teamService.deactivate(Number(req.params.id));
  if (!success) throw new AppError(404, 'Team not found');
  res.json({ success: true });
}));

export { router as teamRoutes };
