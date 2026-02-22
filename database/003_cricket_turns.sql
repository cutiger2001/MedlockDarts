-- ============================================================
-- Migration 003: CricketTurns table
-- Separate turns table for Cricket and Shanghai games with
-- individual columns for each board segment (1-20 + Bull).
-- ============================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CricketTurns')
CREATE TABLE CricketTurns (
    CricketTurnID   INT IDENTITY(1,1) PRIMARY KEY,
    GameID          INT             NOT NULL,
    PlayerID        INT             NOT NULL,
    TeamSeasonID    INT             NOT NULL,
    TurnNumber      INT             NOT NULL,
    RoundNumber     INT             NOT NULL,
    DartsThrown     INT             NOT NULL DEFAULT 3,

    -- Per-segment marks hit this turn (0-9 theoretical max per segment per turn)
    Seg1            INT             NOT NULL DEFAULT 0,
    Seg2            INT             NOT NULL DEFAULT 0,
    Seg3            INT             NOT NULL DEFAULT 0,
    Seg4            INT             NOT NULL DEFAULT 0,
    Seg5            INT             NOT NULL DEFAULT 0,
    Seg6            INT             NOT NULL DEFAULT 0,
    Seg7            INT             NOT NULL DEFAULT 0,
    Seg8            INT             NOT NULL DEFAULT 0,
    Seg9            INT             NOT NULL DEFAULT 0,
    Seg10           INT             NOT NULL DEFAULT 0,
    Seg11           INT             NOT NULL DEFAULT 0,
    Seg12           INT             NOT NULL DEFAULT 0,
    Seg13           INT             NOT NULL DEFAULT 0,
    Seg14           INT             NOT NULL DEFAULT 0,
    Seg15           INT             NOT NULL DEFAULT 0,
    Seg16           INT             NOT NULL DEFAULT 0,
    Seg17           INT             NOT NULL DEFAULT 0,
    Seg18           INT             NOT NULL DEFAULT 0,
    Seg19           INT             NOT NULL DEFAULT 0,
    Seg20           INT             NOT NULL DEFAULT 0,
    SegBull         INT             NOT NULL DEFAULT 0,

    -- Scoring summary
    Points          INT             NOT NULL DEFAULT 0,     -- points scored this turn (overflow)
    MarksScored     INT             NOT NULL DEFAULT 0,     -- total marks this turn
    IsCricketClose  BIT             NOT NULL DEFAULT 0,     -- winning turn in Cricket
    IsShanghaiBonus BIT             NOT NULL DEFAULT 0,     -- +200 Shanghai button used

    -- Dart-by-dart detail (JSON)
    Details         NVARCHAR(MAX)   NULL,

    CreatedAt       DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT FK_CricketTurns_Game FOREIGN KEY (GameID) REFERENCES Games(GameID),
    CONSTRAINT FK_CricketTurns_Player FOREIGN KEY (PlayerID) REFERENCES Players(PlayerID),
    CONSTRAINT FK_CricketTurns_TeamSeason FOREIGN KEY (TeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID)
);
GO

-- Index for common queries
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CricketTurns_GamePlayer')
    CREATE NONCLUSTERED INDEX IX_CricketTurns_GamePlayer ON CricketTurns (GameID, PlayerID);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CricketTurns_GameTeam')
    CREATE NONCLUSTERED INDEX IX_CricketTurns_GameTeam ON CricketTurns (GameID, TeamSeasonID);
GO

PRINT 'CricketTurns table created successfully.';
GO
