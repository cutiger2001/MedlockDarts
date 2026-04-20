-- Add KillerLives column to Games table for the Killer game mode
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Games') AND name = 'KillerLives'
)
BEGIN
  ALTER TABLE Games ADD KillerLives INT NULL;
END
GO

-- Update the GameType CHECK constraint to include 'Killer'
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Games_Type')
BEGIN
  ALTER TABLE Games DROP CONSTRAINT CK_Games_Type;
END
GO

ALTER TABLE Games ADD CONSTRAINT CK_Games_Type
  CHECK (GameType IN ('X01','Cricket','Shanghai','RoundTheWorld','Killer'));
GO
