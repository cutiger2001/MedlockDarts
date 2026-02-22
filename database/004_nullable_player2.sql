-- ============================================================
-- Migration 004: Allow solo teams (Player2ID nullable)
-- Enables single-player ad-hoc games
-- ============================================================
USE DartsLeague;
GO

-- 1. Drop the check constraint that requires Player1 <> Player2
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Teams_DifferentPlayers')
BEGIN
    ALTER TABLE Teams DROP CONSTRAINT CK_Teams_DifferentPlayers;
    PRINT 'Dropped CK_Teams_DifferentPlayers constraint.';
END
GO

-- 2. Make Player2ID nullable
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Teams') AND name = 'Player2ID' AND is_nullable = 0)
BEGIN
    -- Drop FK constraint first
    IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Teams_Player2')
        ALTER TABLE Teams DROP CONSTRAINT FK_Teams_Player2;

    ALTER TABLE Teams ALTER COLUMN Player2ID INT NULL;

    -- Re-add FK constraint
    ALTER TABLE Teams ADD CONSTRAINT FK_Teams_Player2
        FOREIGN KEY (Player2ID) REFERENCES Players(PlayerID);

    PRINT 'Made Player2ID nullable.';
END
GO

-- 3. Re-add check constraint that only fires when both are non-null
ALTER TABLE Teams ADD CONSTRAINT CK_Teams_DifferentPlayers
    CHECK (Player2ID IS NULL OR Player1ID <> Player2ID);
GO

-- 4. Drop the Matches constraint that prevents same team on both sides
--    (solo play requires same team/player on both sides; app logic prevents in league)
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Matches_DifferentTeams')
BEGIN
    ALTER TABLE Matches DROP CONSTRAINT CK_Matches_DifferentTeams;
    PRINT 'Dropped CK_Matches_DifferentTeams constraint.';
END
GO

PRINT 'Migration 004 complete — solo teams supported.';
GO
