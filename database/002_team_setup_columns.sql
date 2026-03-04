-- ============================================================
-- Add team color and nickname to TeamSeasons
-- These allow teams to pick display colors and short nicknames
-- ============================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TeamSeasons') AND name = 'TeamColor')
    ALTER TABLE TeamSeasons ADD TeamColor NVARCHAR(7) NULL;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('TeamSeasons') AND name = 'TeamNickname')
    ALTER TABLE TeamSeasons ADD TeamNickname NVARCHAR(100) NULL;
GO

PRINT 'TeamSeasons columns (TeamColor, TeamNickname) added successfully.';
GO
