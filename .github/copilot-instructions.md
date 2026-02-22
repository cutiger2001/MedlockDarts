# Copilot Instructions — Darts Scoring App

## Project Overview

A **dart scoring app** for league play, supporting mobile (iOS/Android tablets) and web. Built as a responsive web app with an **MS-SQL** backend. The UI reference is [ScoreDarts](https://www.scoredarts.com/online/) and the [Score Darts iOS app](https://apps.apple.com/gb/app/score-darts-scorer/id587868848).

Key differentiator: **league play** with team/player statistics tracking across seasons.

## Architecture & Data Model

- **Backend:** MS-SQL Server (local). Design all schemas with SQL Server compatibility (T-SQL, `IDENTITY`, `NVARCHAR`, etc.).
- **Frontend:** Responsive web app optimized for tablet/phone touch targets. No native mobile builds.
- **Player:** Individual person with name and device-captured image. Players are reused across teams/seasons.
- **Team:** Exactly 2 players. Each team in each league season gets a **unique identifier** for long-term stat isolation.
- **Match:** A match belongs to a league round-robin schedule. Contains multiple games.
- **Game types:** X01, Cricket, Shanghai, Round the World (see below).
- **Turn-level tracking:** Store every turn's score per player per game for later analysis.

## Color Themes

Users choose a theme at setup. Implement as a switchable CSS/theme-token system:

| Theme   | Source |
|---------|--------|
| DJ      | [Notre Dame colors](https://onmessage.nd.edu/university-branding/colors/) |
| TD      | [Clemson colors](https://www.clemson.edu/brand/color/) |
| Default | [USA flag colors](https://www.flagcolorcodes.com/usa) with neutral grey background |

## Game Rules & Scoring

### X01 (301, 501, or custom 101–2001)
- Configurable "Double In" option. Track **INs** (count + avg score of the double-in dart).
- Track **OUTs** (count + avg score of the closing dart).
- Core stat: **Points Per Dart (PPD)**.

### Cricket
- Rules: [ScoreDarts Cricket Help](https://www.scoredarts.com/crickethelp/)
- Core stat: **Marks Per Round (MPR)**.
- Track **CLOSE** (the player who throws the winning dart).

### Shanghai
- Same as Cricket **plus** three extra segments: **Triples (T)**, **Doubles (D)**, **Three in the Bed (3B)**.
- If the opposing team hasn't closed T/D/3B, points scored on those segments add to your team's total.
- Include a **"Shanghai" button** that awards +200 points.

### Round the World
- Modes: 1→20, 20→1, or **Random** (generate shuffled list of 1–20 + Bull).
- Scores count only for the currently targeted segment. Show which number the player must aim at.

## League Play

- **Round-robin** schedule: every team plays every other team.
- **Playoffs:** Top 4 teams → Semi-finals (1v4, 2v3) → Finals.
- Tiebreak rules: follow [Medlock Bridge Dart League rules](https://danielgeojean.wixsite.com/medlock-bridge-dart/rules).
- Scoring rules: follow [NDA rules](https://ndadarts.com/nda-rules/).
- **Coin toss button** at match start — random Heads/Tails with visual feedback.

## Statistics

- **Per-player:** PPD, MPR, INs (count + avg), OUTs (count + avg), CLOSEs, All-Stars (per league rules).
- **Per-team:** Combined/averaged stats of both players; tracked per season via unique team-season ID.
- All stats derivable from **turn-level data** stored for every game.

## Engineering Standards

This is a **production-grade** application. All code (frontend and backend) must be clean, maintainable, and scalable.

### Architecture Principles
- **Layered architecture:** UI → Service → Domain → Data. Maintain separation of concerns.
- Clear API contracts between layers and services.
- Environment-based configuration (no hardcoded connection strings, URLs, or secrets).
- Logging and structured error handling are required in every layer.

### Code Standards
- No magic numbers or hardcoded secrets — use named constants and config.
- No unnecessary dependencies — justify every addition.
- Prefer clarity over cleverness; small, focused functions.
- Strong typing where available (TypeScript strict mode, SQL column types, etc.).
- Defensive programming — validate assumptions, handle edge cases.
- Avoid over-engineering; build what's needed now, design for what's likely next.

### Security
- Validate all inputs at API boundaries.
- Sanitize external data before processing or storage.
- Never expose internal details (stack traces, SQL errors) in user-facing error responses.
- Follow least-privilege principles for DB connections and API access.

### Testing
- All code must be testable — avoid tightly coupled logic.
- Prefer dependency injection to enable mocking and isolation.
- Write unit tests for domain/service logic; integration tests for API and data layers.

### Performance
- Avoid obvious inefficiencies (N+1 queries, unbounded result sets, blocking I/O on main thread).
- Use async/non-blocking patterns where relevant.
- Do not prematurely optimize — measure first, then tune.

## Implemented Tech Stack

- **Frontend:** React 18 + TypeScript, Vite 5, React Router v6
- **Backend:** Express 4 + TypeScript, `mssql` package (raw T-SQL), Winston logging
- **Database:** MS-SQL Server (localhost, SQL Auth, DB: `DartsLeague`)
- **Monorepo:** Root `package.json` with `concurrently` to run `client/` and `server/`
- **Theming:** CSS Custom Properties with `ThemeContext` + localStorage persistence
- **No ORM:** Raw T-SQL in service layer for full SQL Server control

## Project Structure

```
├── .env.example                # Environment variable template
├── .github/copilot-instructions.md
├── database/
│   └── 001_create_schema.sql   # Full schema (Players, Seasons, Teams, etc.)
├── server/
│   ├── src/
│   │   ├── index.ts            # Entry point (graceful shutdown)
│   │   ├── app.ts              # Express setup, middleware, route mounting
│   │   ├── config/             # DB pool + env config
│   │   ├── middleware/         # Error handler, logger
│   │   ├── routes/             # Express routers (players, teams, seasons, matches, games, stats)
│   │   ├── services/           # Business logic + SQL queries
│   │   └── types/              # Shared TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
├── client/
│   ├── src/
│   │   ├── main.tsx / App.tsx  # React entry + router
│   │   ├── App.css             # Global styles + CSS custom properties
│   │   ├── contexts/           # ThemeContext
│   │   ├── themes/             # Theme token definitions (default, DJ, TD)
│   │   ├── types/              # Frontend type mirrors
│   │   ├── services/           # API fetch wrappers per entity
│   │   ├── components/
│   │   │   ├── common/         # Button, Card, Modal, Input, Select, ImageCapture
│   │   │   ├── layout/         # Header (theme switcher), Layout
│   │   │   ├── match/          # CoinToss
│   │   │   └── games/          # X01Scoreboard, CricketScoreboard, ShanghaiScoreboard, RoundTheWorldScoreboard
│   │   └── pages/              # HomePage, PlayersPage, TeamsPage, LeaguePage, MatchPage, GamePage, StatsPage
│   ├── index.html
│   ├── vite.config.ts          # Dev proxy /api → localhost:3001
│   ├── package.json
│   └── tsconfig.json
└── package.json                # Root: `npm run dev` starts both client + server
```

## Development Commands

```bash
# Install all dependencies
npm run install:all

# Start dev (client + server concurrently)
npm run dev

# Run DB schema (execute in SSMS or sqlcmd)
sqlcmd -S localhost -U sa -P <password> -d master -i database/001_create_schema.sql
```

## API Route Map

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/players` | List / create players |
| GET/PUT/DELETE | `/api/players/:id` | Single player CRUD |
| GET/POST | `/api/teams` | List / create teams |
| GET/PUT/DELETE | `/api/teams/:id` | Single team CRUD |
| GET/POST | `/api/seasons` | List / create seasons |
| GET/PUT | `/api/seasons/:id` | Season detail / update |
| POST | `/api/seasons/:id/teams` | Register team to season |
| POST | `/api/seasons/:id/schedule` | Generate round-robin |
| POST | `/api/seasons/:id/playoffs` | Generate playoffs |
| GET | `/api/matches?seasonId=` | List matches (optional season filter) |
| GET/PUT | `/api/matches/:id` | Match detail / status update |
| POST | `/api/matches/:id/coin-toss` | Execute coin toss |
| GET/POST | `/api/games/match/:matchId` | List / create games for match |
| GET/PUT | `/api/games/:id` | Game detail / status update |
| GET/POST | `/api/games/:id/turns` | List / add turns |
| DELETE | `/api/games/:id/turns/last` | Undo last turn |
| GET/PUT | `/api/games/:id/cricket-state` | Cricket/Shanghai marks state |
| GET | `/api/stats/players/:id` | Player stats (PPD, MPR, etc.) |
| GET | `/api/stats/teams/:id` | Team stats |
| GET | `/api/stats/seasons/:id/leaderboard` | Season leaderboard |

## Conventions for AI Agents

- When generating SQL, target **MS-SQL / T-SQL** syntax (not MySQL or PostgreSQL).
- Design UI components for **touch-first tablet use** — large tap targets, minimal text input.
- Keep game-type logic modular; each game type should be its own component/module so new variants can be added.
- Player images are captured on-device (camera/gallery); handle as base64 or blob storage.
- Service files own all SQL queries — routes should only validate input and call services.
- Keep frontend `services/` as thin fetch wrappers — business logic belongs in components or backend.
- Theme tokens are CSS custom properties (`--color-primary`, etc.) — never hardcode colors.
- Reference [Inital Propmpt.txt](../Inital%20Propmpt.txt) for the full original requirements.
