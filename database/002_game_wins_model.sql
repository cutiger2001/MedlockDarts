-- ============================================================
-- Migration 002: Switch to GameWins standings model
-- 
-- Changes:
--   - Add GameWins column to TeamSeasons (total game wins across matches)
--   - Populate from existing PointsFor data
--   - PointsFor/PointsAgainst continue being used for game wins/losses per match
--   - Wins/Losses/Draws are kept in schema but ignored by application
-- ============================================================

-- Add GameWins if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TeamSeasons') AND name = 'GameWins')
BEGIN
    ALTER TABLE TeamSeasons ADD GameWins INT NOT NULL DEFAULT 0;
    PRINT 'Added GameWins column to TeamSeasons';
END
GO

-- Backfill from existing PointsFor (separate batch so column is visible)
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TeamSeasons') AND name = 'GameWins')
    AND EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('TeamSeasons') AND name = 'PointsFor')
BEGIN
    UPDATE TeamSeasons SET GameWins = PointsFor WHERE GameWins = 0 AND PointsFor > 0;
END
GO

-- Add HomeScore / AwayScore to Matches for storing the 5-point result
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Matches') AND name = 'HomeScore')
BEGIN
    ALTER TABLE Matches ADD HomeScore INT NOT NULL DEFAULT 0;
    ALTER TABLE Matches ADD AwayScore INT NOT NULL DEFAULT 0;
    PRINT 'Added HomeScore/AwayScore columns to Matches';
END
GO

PRINT 'Migration 002 complete.';
GO
