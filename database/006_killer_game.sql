-- 006_killer_game.sql
-- KillerLives column and Killer GameType are now part of 001_create_schema.sql.
-- This script is kept for safe idempotent application on existing databases
-- that were deployed before Killer support was added to the base schema.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Games') AND name = 'KillerLives'
)
BEGIN
  ALTER TABLE Games ADD KillerLives INT NULL;
END
GO

-- Ensure Killer is in the GameType CHECK constraint
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Games_Type')
BEGIN
  ALTER TABLE Games DROP CONSTRAINT CK_Games_Type;
END
GO

ALTER TABLE Games ADD CONSTRAINT CK_Games_Type
  CHECK (GameType IN ('X01','Cricket','Shanghai','RoundTheWorld','Killer'));
GO

