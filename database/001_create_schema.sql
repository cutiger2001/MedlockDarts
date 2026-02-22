-- ============================================================
-- Darts League App — Database Schema
-- Target: MS-SQL Server (T-SQL)
-- Run this script to create the DartsLeague database and all tables.
-- ============================================================

-- Create database (run separately if needed)
-- CREATE DATABASE DartsLeague;
-- GO
-- USE DartsLeague;
-- GO

-- ============================================================
-- Players
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Players')
CREATE TABLE Players (
    PlayerID        INT IDENTITY(1,1) PRIMARY KEY,
    FirstName       NVARCHAR(100)   NOT NULL,
    LastName        NVARCHAR(100)   NOT NULL,
    Nickname        NVARCHAR(100)   NULL,
    ImageData       NVARCHAR(MAX)   NULL,          -- base64 encoded image
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
-- Seasons
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Seasons')
CREATE TABLE Seasons (
    SeasonID        INT IDENTITY(1,1) PRIMARY KEY,
    SeasonName      NVARCHAR(200)   NOT NULL,
    StartDate       DATE            NULL,
    EndDate         DATE            NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    Status          NVARCHAR(20)    NOT NULL DEFAULT 'Setup',   -- Setup, RoundRobin, Playoffs, Completed
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

-- ============================================================
-- Teams
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Teams')
CREATE TABLE Teams (
    TeamID          INT IDENTITY(1,1) PRIMARY KEY,
    TeamName        NVARCHAR(200)   NOT NULL,
    Player1ID       INT             NOT NULL,
    Player2ID       INT             NOT NULL,
    IsActive        BIT             NOT NULL DEFAULT 1,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Teams_Player1 FOREIGN KEY (Player1ID) REFERENCES Players(PlayerID),
    CONSTRAINT FK_Teams_Player2 FOREIGN KEY (Player2ID) REFERENCES Players(PlayerID),
    CONSTRAINT CK_Teams_DifferentPlayers CHECK (Player1ID <> Player2ID)
);
GO

-- ============================================================
-- TeamSeasons — unique team identity per league season
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TeamSeasons')
CREATE TABLE TeamSeasons (
    TeamSeasonID    INT IDENTITY(1,1) PRIMARY KEY,
    TeamID          INT             NOT NULL,
    SeasonID        INT             NOT NULL,
    Wins            INT             NOT NULL DEFAULT 0,
    Losses          INT             NOT NULL DEFAULT 0,
    Draws           INT             NOT NULL DEFAULT 0,
    PointsFor       INT             NOT NULL DEFAULT 0,
    PointsAgainst   INT             NOT NULL DEFAULT 0,
    PlayoffSeed     INT             NULL,
    IsEliminated    BIT             NOT NULL DEFAULT 0,
    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_TeamSeasons_Team FOREIGN KEY (TeamID) REFERENCES Teams(TeamID),
    CONSTRAINT FK_TeamSeasons_Season FOREIGN KEY (SeasonID) REFERENCES Seasons(SeasonID),
    CONSTRAINT UQ_TeamSeasons UNIQUE (TeamID, SeasonID)
);
GO

-- ============================================================
-- Matches
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Matches')
CREATE TABLE Matches (
    MatchID             INT IDENTITY(1,1) PRIMARY KEY,
    SeasonID            INT             NOT NULL,
    HomeTeamSeasonID    INT             NOT NULL,
    AwayTeamSeasonID    INT             NOT NULL,
    RoundNumber         INT             NOT NULL DEFAULT 1,
    MatchDate           DATETIME2       NULL,
    Status              NVARCHAR(20)    NOT NULL DEFAULT 'Scheduled',  -- Scheduled, InProgress, Completed
    WinnerTeamSeasonID  INT             NULL,
    IsPlayoff           BIT             NOT NULL DEFAULT 0,
    PlayoffRound        NVARCHAR(20)    NULL,        -- 'Semi', 'Final'
    CoinTossResult      NVARCHAR(10)    NULL,        -- 'Heads', 'Tails'
    CoinTossWinnerTSID  INT             NULL,        -- TeamSeasonID that won the toss
    CreatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Matches_Season FOREIGN KEY (SeasonID) REFERENCES Seasons(SeasonID),
    CONSTRAINT FK_Matches_Home FOREIGN KEY (HomeTeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID),
    CONSTRAINT FK_Matches_Away FOREIGN KEY (AwayTeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID),
    CONSTRAINT FK_Matches_Winner FOREIGN KEY (WinnerTeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID),
    CONSTRAINT CK_Matches_DifferentTeams CHECK (HomeTeamSeasonID <> AwayTeamSeasonID)
);
GO

-- ============================================================
-- Games — individual games within a match
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Games')
CREATE TABLE Games (
    GameID              INT IDENTITY(1,1) PRIMARY KEY,
    MatchID             INT             NOT NULL,
    GameType            NVARCHAR(20)    NOT NULL,     -- 'X01', 'Cricket', 'Shanghai', 'RoundTheWorld'
    GameNumber          INT             NOT NULL DEFAULT 1,
    X01Target           INT             NULL,          -- 301, 501, etc.
    DoubleInRequired    BIT             NOT NULL DEFAULT 0,
    RtwMode             NVARCHAR(10)    NULL,          -- '1to20', '20to1', 'Random'
    RtwSequence         NVARCHAR(MAX)   NULL,          -- JSON array for random order
    Status              NVARCHAR(20)    NOT NULL DEFAULT 'NotStarted', -- NotStarted, InProgress, Completed
    WinnerTeamSeasonID  INT             NULL,
    CreatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt           DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Games_Match FOREIGN KEY (MatchID) REFERENCES Matches(MatchID),
    CONSTRAINT FK_Games_Winner FOREIGN KEY (WinnerTeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID),
    CONSTRAINT CK_Games_Type CHECK (GameType IN ('X01', 'Cricket', 'Shanghai', 'RoundTheWorld'))
);
GO

-- ============================================================
-- GamePlayers — maps players to their team in a game
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GamePlayers')
CREATE TABLE GamePlayers (
    GamePlayerID    INT IDENTITY(1,1) PRIMARY KEY,
    GameID          INT             NOT NULL,
    PlayerID        INT             NOT NULL,
    TeamSeasonID    INT             NOT NULL,
    PlayerOrder     INT             NOT NULL DEFAULT 1,  -- 1 or 2 within team
    CONSTRAINT FK_GamePlayers_Game FOREIGN KEY (GameID) REFERENCES Games(GameID),
    CONSTRAINT FK_GamePlayers_Player FOREIGN KEY (PlayerID) REFERENCES Players(PlayerID),
    CONSTRAINT FK_GamePlayers_TeamSeason FOREIGN KEY (TeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID),
    CONSTRAINT UQ_GamePlayers UNIQUE (GameID, PlayerID)
);
GO

-- ============================================================
-- Turns — every throw recorded for analysis
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Turns')
CREATE TABLE Turns (
    TurnID          INT IDENTITY(1,1) PRIMARY KEY,
    GameID          INT             NOT NULL,
    PlayerID        INT             NOT NULL,
    TeamSeasonID    INT             NOT NULL,
    TurnNumber      INT             NOT NULL,
    RoundNumber     INT             NOT NULL,
    DartsThrown     INT             NOT NULL DEFAULT 3,

    -- X01 fields
    Score           INT             NOT NULL DEFAULT 0,    -- points scored this turn
    RemainingScore  INT             NULL,                   -- remaining X01 score after this turn
    IsDoubleIn      BIT             NOT NULL DEFAULT 0,
    IsGameOut       BIT             NOT NULL DEFAULT 0,     -- closing turn of X01

    -- Cricket / Shanghai fields
    MarksScored     INT             NULL,                   -- total marks this turn
    IsCricketClose  BIT             NOT NULL DEFAULT 0,     -- winning dart in Cricket

    -- Shanghai extra fields
    IsShanghaiBonus BIT             NOT NULL DEFAULT 0,     -- +200 Shanghai button

    -- Round the World fields
    RtwTargetHit    BIT             NOT NULL DEFAULT 0,     -- did they hit the target segment?

    -- Detailed dart-by-dart data (JSON)
    Details         NVARCHAR(MAX)   NULL,

    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_Turns_Game FOREIGN KEY (GameID) REFERENCES Games(GameID),
    CONSTRAINT FK_Turns_Player FOREIGN KEY (PlayerID) REFERENCES Players(PlayerID),
    CONSTRAINT FK_Turns_TeamSeason FOREIGN KEY (TeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID)
);
GO

-- ============================================================
-- CricketState — current state of cricket board per team per game
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CricketState')
CREATE TABLE CricketState (
    CricketStateID  INT IDENTITY(1,1) PRIMARY KEY,
    GameID          INT             NOT NULL,
    TeamSeasonID    INT             NOT NULL,
    Seg20           INT             NOT NULL DEFAULT 0,  -- marks on 20 (0-3, 3=closed)
    Seg19           INT             NOT NULL DEFAULT 0,
    Seg18           INT             NOT NULL DEFAULT 0,
    Seg17           INT             NOT NULL DEFAULT 0,
    Seg16           INT             NOT NULL DEFAULT 0,
    Seg15           INT             NOT NULL DEFAULT 0,
    SegBull         INT             NOT NULL DEFAULT 0,
    -- Shanghai extras
    SegTriples      INT             NOT NULL DEFAULT 0,
    SegDoubles      INT             NOT NULL DEFAULT 0,
    SegThreeInBed   INT             NOT NULL DEFAULT 0,
    Points          INT             NOT NULL DEFAULT 0,
    CONSTRAINT FK_CricketState_Game FOREIGN KEY (GameID) REFERENCES Games(GameID),
    CONSTRAINT FK_CricketState_TeamSeason FOREIGN KEY (TeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID),
    CONSTRAINT UQ_CricketState UNIQUE (GameID, TeamSeasonID)
);
GO

-- ============================================================
-- Indexes for common queries
-- ============================================================
CREATE NONCLUSTERED INDEX IX_Turns_GamePlayer ON Turns (GameID, PlayerID);
CREATE NONCLUSTERED INDEX IX_Games_Match ON Games (MatchID);
CREATE NONCLUSTERED INDEX IX_Matches_Season ON Matches (SeasonID);
CREATE NONCLUSTERED INDEX IX_TeamSeasons_Season ON TeamSeasons (SeasonID);
GO

PRINT 'Darts League schema created successfully.';
GO
