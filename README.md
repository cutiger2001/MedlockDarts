# Medlock Bridge Darts League

A dart scoring application for league play, supporting mobile tablets and web browsers. Features X01, Cricket, Shanghai, and Round the World game types with full team/player statistics tracking across seasons.

## Quick Start (Windows Deployment)

### Prerequisites
- Windows 10 or later (64-bit)
- Internet connection (for first-time install only)

The installer will automatically download and install:
- **SQL Server 2022 Express** — local database engine
- **Node.js 20 LTS** — application server runtime

### Installation

1. **Clone or download** this repository:
   ```
   git clone https://github.com/cutiger2001/MedlockDarts.git
   cd MedlockDarts
   ```

2. **Run the installer** (as Administrator):
   - Right-click `install.ps1` → **Run with PowerShell**
   - Or from an admin PowerShell prompt:
     ```powershell
     Set-ExecutionPolicy Bypass -Scope Process -Force
     .\install.ps1
     ```

3. The installer will:
   - Install SQL Server Express (if not present)
   - Install Node.js (if not present)
   - Create the `DartsLeague` database and apply all migrations
   - Install npm dependencies and build client + server
   - Configure Windows Firewall for LAN access
   - Create a **"Darts League"** desktop shortcut

### Running the App

Double-click the **"Darts League"** icon on your Desktop.

A console window will appear showing:
```
=======================================================
  Medlock Bridge Darts League
=======================================================
  Local:   http://localhost:3001
  Network: http://192.168.x.x:3001

  Open the Network URL on your tablet/phone browser
  Press Ctrl+C to stop the server
=======================================================
```

- **This computer:** Open http://localhost:3001
- **Tablets/Phones:** Open the Network URL displayed in the console (devices must be on the same WiFi network)
- **To stop:** Close the console window or press `Ctrl+C`

### Installer Options

```powershell
# Custom database password
.\install.ps1 -DbPassword "MyCustomPassword123"

# Skip SQL Server install (if using existing instance)
.\install.ps1 -SkipSqlInstall

# Skip Node.js install (if already installed)
.\install.ps1 -SkipNodeInstall
```

## Development Setup

For development with hot-reload:

```bash
# Install all dependencies
npm run install:all

# Copy and edit environment config
copy .env.example server\.env
# Edit server\.env — set NODE_ENV=development

# Start dev servers (client + server with hot-reload)
npm run dev
```

- Client dev server: http://localhost:5173 (Vite with proxy to API)
- API server: http://localhost:3001

## Project Structure

```
├── install.ps1              # Windows installer script
├── Start-DartsApp.bat       # Desktop launcher
├── .env.example             # Environment config template
├── database/                # SQL migration scripts (run in order)
│   ├── 001_create_schema.sql
│   ├── 002_*.sql
│   └── ...
├── server/                  # Express + TypeScript API
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── app.ts           # Express app (serves API + built client)
│   │   ├── config/          # DB pool + env config
│   │   ├── routes/          # API route handlers
│   │   ├── services/        # Business logic + SQL queries
│   │   └── types/           # TypeScript interfaces
│   └── dist/                # Compiled output (production)
├── client/                  # React + TypeScript SPA
│   ├── src/
│   │   ├── pages/           # Route pages
│   │   ├── components/      # UI components (games, layout, common)
│   │   ├── services/        # API fetch wrappers
│   │   └── themes/          # CSS theme tokens
│   └── dist/                # Built output (production)
└── tests/                   # Integration test scripts
```

## Game Types

| Game | Description | Key Stat |
|------|-------------|----------|
| **X01** | 301/501/custom. Optional Double-In. | PPD (Points Per Dart) |
| **Cricket** | Close 15–20 + Bull. Score points on open segments. | MPR (Marks Per Round) |
| **Shanghai** | Cricket + Triples/Doubles/3-in-Bed segments + Shanghai bonus. | MPR |
| **Round the World** | Hit 1→20 (or 20→1, or Random order) + Bull. | Completion time |

## League Features

- Round-robin schedule generation
- Playoff bracket (semi-finals → final)
- Per-player and per-team statistics (PPD, MPR, INs, OUTs, Closes)
- Season leaderboards
- Live match scores
- Coin toss

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite 5, React Router v6
- **Backend:** Express 4, TypeScript, raw T-SQL via `mssql` package
- **Database:** SQL Server 2022 Express
- **Logging:** Winston

## API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET/POST | `/api/players` | List / create players |
| GET/PUT/DELETE | `/api/players/:id` | Player CRUD |
| GET/POST | `/api/teams` | List / create teams |
| GET/POST | `/api/seasons` | List / create seasons |
| POST | `/api/seasons/:id/schedule` | Generate round-robin |
| GET | `/api/matches/live` | Active matches |
| POST | `/api/games/ad-hoc` | Create ad-hoc game |
| POST | `/api/games/:id/turns` | Add turn |
| GET | `/api/stats/players/:id` | Player statistics |
| GET | `/api/stats/seasons/:id/leaderboard` | Season leaderboard |

## License

Private — Medlock Bridge Dart League
