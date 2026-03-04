-- ============================================================
-- Migration 003: Add ThemeColor to Players
-- Allows players to pick a personal color used for their
-- avatar and "Now Throwing" box during games.
-- ============================================================

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Players') AND name = 'ThemeColor'
)
BEGIN
  ALTER TABLE Players ADD ThemeColor NVARCHAR(7) NULL;
  PRINT 'Players.ThemeColor column added successfully.';
END
ELSE
  PRINT 'Players.ThemeColor column already exists.';
GO
