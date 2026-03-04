-- ============================================================
-- Migration 005: Add ChampionTeamSeasonID to Seasons
-- Tracks which team won the season championship
-- ============================================================
USE DartsLeague;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Seasons') AND name = 'ChampionTeamSeasonID')
BEGIN
    ALTER TABLE Seasons ADD ChampionTeamSeasonID INT NULL;
    ALTER TABLE Seasons ADD CONSTRAINT FK_Seasons_Champion
        FOREIGN KEY (ChampionTeamSeasonID) REFERENCES TeamSeasons(TeamSeasonID);
    PRINT 'Added ChampionTeamSeasonID column to Seasons';
END
GO
