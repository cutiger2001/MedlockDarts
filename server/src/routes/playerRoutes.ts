import { Router, Request, Response, NextFunction } from 'express';
import { playerService } from '../services/playerService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

router.get('/', asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const players = includeInactive
    ? await playerService.getAllIncludingInactive()
    : await playerService.getAll();
  res.json(players);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const player = await playerService.getById(Number(req.params.id));
  if (!player) throw new AppError(404, 'Player not found');
  res.json(player);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { FirstName, LastName, Nickname, ImageData } = req.body;
  if (!FirstName) throw new AppError(400, 'FirstName is required');
  const player = await playerService.create({ FirstName, LastName, Nickname, ImageData });
  res.status(201).json(player);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const player = await playerService.update(Number(req.params.id), req.body);
  if (!player) throw new AppError(404, 'Player not found');
  res.json(player);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const hasGames = await playerService.hasLeagueGames(id);
  if (hasGames) {
    // Player has league history — deactivate instead of hard delete
    const success = await playerService.deactivate(id);
    if (!success) throw new AppError(404, 'Player not found');
    res.json({ success: true, deactivated: true });
  } else {
    // No league history — safe to hard delete
    const success = await playerService.hardDelete(id);
    if (!success) throw new AppError(404, 'Player not found');
    res.json({ success: true, deleted: true });
  }
}));

// Reactivate a deactivated player
router.put('/:id/reactivate', asyncHandler(async (req, res) => {
  const success = await playerService.reactivate(Number(req.params.id));
  if (!success) throw new AppError(404, 'Player not found');
  res.json({ success: true });
}));

export { router as playerRoutes };
