-- ============================================================
-- Migration: Ad-Hoc Play Support
-- Allow single-player teams (Player2ID nullable)
-- ============================================================

-- Make Player2ID nullable for ad-hoc / single-player teams
ALTER TABLE Teams ALTER COLUMN Player2ID INT NULL;
GO

-- Drop old constraint and re-add with NULL-safe version
IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_Teams_DifferentPlayers')
  ALTER TABLE Teams DROP CONSTRAINT CK_Teams_DifferentPlayers;
GO

ALTER TABLE Teams ADD CONSTRAINT CK_Teams_DifferentPlayers
  CHECK (Player2ID IS NULL OR Player1ID <> Player2ID);
GO

PRINT 'Ad-hoc play migration completed successfully.';
GO
