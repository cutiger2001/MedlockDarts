import { Router, Request, Response, NextFunction } from 'express';
import { gameService } from '../services/gameService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

// Get games for a match
router.get('/match/:matchId', asyncHandler(async (req, res) => {
  const games = await gameService.getByMatch(Number(req.params.matchId));
  res.json(games);
}));

// Get single game
router.get('/:id', asyncHandler(async (req, res) => {
  const game = await gameService.getById(Number(req.params.id));
  if (!game) throw new AppError(404, 'Game not found');
  res.json(game);
}));

// Create game
router.post('/', asyncHandler(async (req, res) => {
  const { MatchID, GameType, GameNumber, X01Target, DoubleInRequired, RtwMode } = req.body;
  if (!MatchID || !GameType) throw new AppError(400, 'MatchID and GameType are required');
  const game = await gameService.create({ MatchID, GameType, GameNumber, X01Target, DoubleInRequired, RtwMode });
  res.status(201).json(game);
}));

// Create ad-hoc game (no existing match/season needed)
router.post('/ad-hoc', asyncHandler(async (req, res) => {
  const { GameType, X01Target, DoubleInRequired, RtwMode, TeamAPlayers, TeamBPlayers, TeamPlay } = req.body;
  if (!GameType) throw new AppError(400, 'GameType is required');
  if (!TeamAPlayers || !Array.isArray(TeamAPlayers) || TeamAPlayers.length === 0) {
    throw new AppError(400, 'At least one player is required for Team A');
  }
  // TeamB is optional for solo play
  const teamBArr = Array.isArray(TeamBPlayers) ? TeamBPlayers : [];
  // Team play validation: both teams must have matching player counts, max 4 per team
  if (TeamPlay) {
    if (teamBArr.length === 0) {
      throw new AppError(400, 'Team play requires at least one player on each team');
    }
    if (TeamAPlayers.length !== teamBArr.length) {
      throw new AppError(400, 'Both teams must have the same number of players for team play');
    }
    if (TeamAPlayers.length > 4 || teamBArr.length > 4) {
      throw new AppError(400, 'Maximum 4 players per team');
    }
  }
  const game = await gameService.createAdHoc({
    GameType, X01Target, DoubleInRequired, RtwMode,
    TeamAPlayers, TeamBPlayers: teamBArr, TeamPlay: TeamPlay || false,
  });
  res.status(201).json(game);
}));

// Delete (abandon) a game and its related data — ad-hoc only
router.delete('/:id', asyncHandler(async (req, res) => {
  const game = await gameService.getById(Number(req.params.id));
  if (!game) throw new AppError(404, 'Game not found');
  await gameService.deleteGame(Number(req.params.id));
  res.json({ success: true });
}));

// Update game status
router.put('/:id/status', asyncHandler(async (req, res) => {
  const { Status, WinnerTeamSeasonID } = req.body;
  const game = await gameService.updateStatus(Number(req.params.id), Status, WinnerTeamSeasonID);
  res.json(game);
}));

// Game players
router.get('/:id/players', asyncHandler(async (req, res) => {
  const players = await gameService.getGamePlayers(Number(req.params.id));
  res.json(players);
}));

router.post('/:id/players', asyncHandler(async (req, res) => {
  const { players } = req.body;
  if (!players || !Array.isArray(players)) throw new AppError(400, 'players array is required');
  await gameService.addGamePlayers(Number(req.params.id), players);
  res.status(201).json({ success: true });
}));

// Turns
router.get('/:id/turns', asyncHandler(async (req, res) => {
  const turns = await gameService.getTurns(Number(req.params.id));
  res.json(turns);
}));

router.post('/:id/turns', asyncHandler(async (req, res) => {
  const turn = await gameService.addTurn(Number(req.params.id), req.body);
  res.status(201).json(turn);
}));

router.delete('/:id/turns/last', asyncHandler(async (req, res) => {
  const success = await gameService.undoLastTurn(Number(req.params.id));
  if (!success) throw new AppError(404, 'No turns to undo');
  res.json({ success: true });
}));

// Cricket turns (separate from X01 turns)
router.get('/:id/cricket-turns', asyncHandler(async (req, res) => {
  const turns = await gameService.getCricketTurns(Number(req.params.id));
  res.json(turns);
}));

router.post('/:id/cricket-turns', asyncHandler(async (req, res) => {
  const turn = await gameService.addCricketTurn(Number(req.params.id), req.body);
  res.status(201).json(turn);
}));

router.delete('/:id/cricket-turns/last', asyncHandler(async (req, res) => {
  const success = await gameService.undoLastCricketTurn(Number(req.params.id));
  if (!success) throw new AppError(404, 'No cricket turns to undo');
  res.json({ success: true });
}));

// Cricket state
router.get('/:id/cricket-state', asyncHandler(async (req, res) => {
  const state = await gameService.getCricketState(Number(req.params.id));
  res.json(state);
}));

router.put('/:id/cricket-state', asyncHandler(async (req, res) => {
  const { TeamSeasonID, ...state } = req.body;
  if (!TeamSeasonID) throw new AppError(400, 'TeamSeasonID is required');
  const result = await gameService.upsertCricketState(Number(req.params.id), TeamSeasonID, state);
  res.json(result);
}));

export { router as gameRoutes };
