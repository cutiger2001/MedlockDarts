-- ============================================================
-- Migration: Season Game Format Configuration
-- Stores the game type & order for each game in a season
-- ============================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SeasonGameFormats')
CREATE TABLE SeasonGameFormats (
    SeasonGameFormatID  INT IDENTITY(1,1) PRIMARY KEY,
    SeasonID            INT             NOT NULL,
    GameNumber          INT             NOT NULL,  -- 1-5 typically
    GameType            NVARCHAR(20)    NOT NULL,
    X01Target           INT             NULL,
    DoubleInRequired    BIT             NOT NULL DEFAULT 0,
    CONSTRAINT FK_SGF_Season FOREIGN KEY (SeasonID) REFERENCES Seasons(SeasonID),
    CONSTRAINT CK_SGF_Type CHECK (GameType IN ('X01', 'Cricket', 'Shanghai', 'RoundTheWorld')),
    CONSTRAINT UQ_SGF UNIQUE (SeasonID, GameNumber)
);
GO

PRINT 'Season game format table created successfully.';
GO
