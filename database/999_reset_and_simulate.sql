-- ============================================================
-- Reset ALL data and simulate 2 full league seasons
-- Target: MS-SQL Server (T-SQL)
-- WARNING: This deletes ALL existing data!
-- ============================================================
USE DartsLeague;
GO

SET NOCOUNT ON;

-- ============================================================
-- 1. DELETE ALL DATA (FK order, child tables first)
-- ============================================================
PRINT '=== Deleting all existing data ===';

DELETE FROM CricketTurns;
DELETE FROM CricketState;
DELETE FROM Turns;
DELETE FROM GamePlayers;
DELETE FROM Games;
DELETE FROM Matches;
DELETE FROM TeamSeasons;
DELETE FROM SeasonGameFormats;
DELETE FROM Teams;
DELETE FROM Seasons;
-- Keep Players but delete them too for clean sim
DELETE FROM Players;

-- Reset identity seeds
DBCC CHECKIDENT ('CricketTurns', RESEED, 0);
DBCC CHECKIDENT ('CricketState', RESEED, 0);
DBCC CHECKIDENT ('Turns', RESEED, 0);
DBCC CHECKIDENT ('GamePlayers', RESEED, 0);
DBCC CHECKIDENT ('Games', RESEED, 0);
DBCC CHECKIDENT ('Matches', RESEED, 0);
DBCC CHECKIDENT ('TeamSeasons', RESEED, 0);
DBCC CHECKIDENT ('SeasonGameFormats', RESEED, 0);
DBCC CHECKIDENT ('Teams', RESEED, 0);
DBCC CHECKIDENT ('Seasons', RESEED, 0);
DBCC CHECKIDENT ('Players', RESEED, 0);

PRINT 'All data deleted and identities reset.';
GO

-- ============================================================
-- 2. CREATE PLAYERS (8 players for 4 teams)
-- ============================================================
PRINT '=== Creating players ===';

INSERT INTO Players (FirstName, LastName, Nickname, IsActive) VALUES
  ('Mike',   'Thompson', 'Big Mike',   1),  -- 1
  ('Dave',   'Johnson',  'DJ',         1),  -- 2
  ('Chris',  'Williams', 'Flash',      1),  -- 3
  ('Jake',   'Anderson', 'Snake',      1),  -- 4
  ('Tom',    'Martinez', 'Tommy Darts',1),  -- 5
  ('Ryan',   'Garcia',   'RG3',        1),  -- 6
  ('Nick',   'Davis',    'The Bull',   1),  -- 7
  ('Brian',  'Wilson',   'B-Dub',      1);  -- 8

PRINT 'Created 8 players.';
GO

-- ============================================================
-- 3. CREATE TEAMS (4 teams of 2)
-- ============================================================
PRINT '=== Creating teams ===';

INSERT INTO Teams (TeamName, Player1ID, Player2ID, IsActive) VALUES
  ('The Bullseyes',      1, 2, 1),  -- TeamID 1: Mike & Dave
  ('Triple Threats',     3, 4, 1),  -- TeamID 2: Chris & Jake
  ('Double Trouble',     5, 6, 1),  -- TeamID 3: Tom & Ryan
  ('Shanghai Shooters',  7, 8, 1);  -- TeamID 4: Nick & Brian

PRINT 'Created 4 teams.';
GO

-- ============================================================
-- 4. CREATE AD-HOC SEASON (always needed)
-- ============================================================
INSERT INTO Seasons (SeasonName, Status, IsActive) VALUES ('Ad-Hoc Play', 'RoundRobin', 1);
DECLARE @adHocSeasonId INT = SCOPE_IDENTITY();
PRINT 'Created Ad-Hoc Play season.';
GO

-- ============================================================
-- Helper: Simulate one X01 game between two teams
-- Returns the winner TeamSeasonID via the @winnerTSID OUTPUT param
-- ============================================================
IF OBJECT_ID('dbo.SimulateX01Game', 'P') IS NOT NULL DROP PROCEDURE dbo.SimulateX01Game;
GO

CREATE PROCEDURE dbo.SimulateX01Game
  @GameID INT,
  @HomeTeamSeasonID INT,
  @AwayTeamSeasonID INT,
  @HomeP1 INT, @HomeP2 INT,
  @AwayP1 INT, @AwayP2 INT,
  @Target INT,
  @WinnerTSID INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;

  -- Insert GamePlayers
  INSERT INTO GamePlayers (GameID, PlayerID, TeamSeasonID, PlayerOrder) VALUES
    (@GameID, @HomeP1, @HomeTeamSeasonID, 1),
    (@GameID, @HomeP2, @HomeTeamSeasonID, 2),
    (@GameID, @AwayP1, @AwayTeamSeasonID, 1),
    (@GameID, @AwayP2, @AwayTeamSeasonID, 2);

  -- Simulate turns alternating between all 4 players
  DECLARE @homeRemaining1 INT = @Target, @homeRemaining2 INT = @Target;
  DECLARE @awayRemaining1 INT = @Target, @awayRemaining2 INT = @Target;
  DECLARE @turnNum INT = 1, @roundNum INT = 1;
  DECLARE @gameOver BIT = 0;
  DECLARE @score INT, @darts INT, @isOut BIT;
  DECLARE @currentPID INT, @currentTSID INT;
  DECLARE @remaining INT;

  -- Player order: HomeP1, AwayP1, HomeP2, AwayP2 (alternating teams)
  WHILE @gameOver = 0 AND @roundNum <= 30
  BEGIN
    -- Each round: 4 players throw
    DECLARE @playerIdx INT = 1;
    WHILE @playerIdx <= 4 AND @gameOver = 0
    BEGIN
      SET @isOut = 0;
      SET @darts = 3;

      IF @playerIdx = 1 BEGIN SET @currentPID = @HomeP1; SET @currentTSID = @HomeTeamSeasonID; SET @remaining = @homeRemaining1; END
      ELSE IF @playerIdx = 2 BEGIN SET @currentPID = @AwayP1; SET @currentTSID = @AwayTeamSeasonID; SET @remaining = @awayRemaining1; END
      ELSE IF @playerIdx = 3 BEGIN SET @currentPID = @HomeP2; SET @currentTSID = @HomeTeamSeasonID; SET @remaining = @homeRemaining2; END
      ELSE BEGIN SET @currentPID = @AwayP2; SET @currentTSID = @AwayTeamSeasonID; SET @remaining = @awayRemaining2; END

      -- Generate realistic score (PPD ~18-25 range -> turn score ~54-75)
      -- Use a base + random variation
      SET @score = 30 + CAST(ABS(CHECKSUM(NEWID())) % 50 AS INT); -- 30-79

      -- Occasional high scores (180, 140, 100)
      IF ABS(CHECKSUM(NEWID())) % 100 < 3 SET @score = 180;
      ELSE IF ABS(CHECKSUM(NEWID())) % 100 < 8 SET @score = 140;
      ELSE IF ABS(CHECKSUM(NEWID())) % 100 < 15 SET @score = 100;

      -- Cap score at remaining
      IF @score > @remaining SET @score = @remaining;

      -- Check for bust on doubles (if remaining < score or remaining - score = 1)
      IF @remaining - @score = 1 SET @score = 0; -- bust (can't leave 1)

      -- Check for game out
      IF @score = @remaining AND @remaining > 1
      BEGIN
        SET @isOut = 1;
        SET @gameOver = 1;
        SET @WinnerTSID = @currentTSID;
        -- Randomize darts on checkout (1-3)
        SET @darts = 1 + CAST(ABS(CHECKSUM(NEWID())) % 3 AS INT);
      END

      -- Update remaining
      DECLARE @newRemaining INT = @remaining - @score;

      IF @playerIdx = 1 SET @homeRemaining1 = @newRemaining;
      ELSE IF @playerIdx = 2 SET @awayRemaining1 = @newRemaining;
      ELSE IF @playerIdx = 3 SET @homeRemaining2 = @newRemaining;
      ELSE SET @awayRemaining2 = @newRemaining;

      -- Insert turn
      INSERT INTO Turns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber, DartsThrown,
                         Score, RemainingScore, IsDoubleIn, IsGameOut)
      VALUES (@GameID, @currentPID, @currentTSID, @turnNum, @roundNum, @darts,
              @score, @newRemaining, 0, @isOut);

      SET @turnNum = @turnNum + 1;
      SET @playerIdx = @playerIdx + 1;
    END

    SET @roundNum = @roundNum + 1;
  END

  -- If no one won in 30 rounds, pick random winner
  IF @gameOver = 0
  BEGIN
    IF ABS(CHECKSUM(NEWID())) % 2 = 0
      SET @WinnerTSID = @HomeTeamSeasonID
    ELSE
      SET @WinnerTSID = @AwayTeamSeasonID;
  END

  -- Complete the game
  UPDATE Games SET Status = 'Completed', WinnerTeamSeasonID = @WinnerTSID, UpdatedAt = SYSUTCDATETIME()
  WHERE GameID = @GameID;
END
GO


-- ============================================================
-- Helper: Simulate one Cricket game between two teams
-- ============================================================
IF OBJECT_ID('dbo.SimulateCricketGame', 'P') IS NOT NULL DROP PROCEDURE dbo.SimulateCricketGame;
GO

CREATE PROCEDURE dbo.SimulateCricketGame
  @GameID INT,
  @HomeTeamSeasonID INT,
  @AwayTeamSeasonID INT,
  @HomeP1 INT, @HomeP2 INT,
  @AwayP1 INT, @AwayP2 INT,
  @WinnerTSID INT OUTPUT
AS
BEGIN
  SET NOCOUNT ON;

  -- Insert GamePlayers
  INSERT INTO GamePlayers (GameID, PlayerID, TeamSeasonID, PlayerOrder) VALUES
    (@GameID, @HomeP1, @HomeTeamSeasonID, 1),
    (@GameID, @HomeP2, @HomeTeamSeasonID, 2),
    (@GameID, @AwayP1, @AwayTeamSeasonID, 1),
    (@GameID, @AwayP2, @AwayTeamSeasonID, 2);

  -- Initialize CricketState for both teams
  INSERT INTO CricketState (GameID, TeamSeasonID,
    Seg20, Seg19, Seg18, Seg17, Seg16, Seg15, SegBull,
    SegTriples, SegDoubles, SegThreeInBed, Points)
  VALUES
    (@GameID, @HomeTeamSeasonID, 0,0,0,0,0,0,0, 0,0,0, 0),
    (@GameID, @AwayTeamSeasonID, 0,0,0,0,0,0,0, 0,0,0, 0);

  -- Cricket segments to close: 20,19,18,17,16,15,Bull
  -- Simulate round by round, each player throws and gets 1-5 marks per turn
  DECLARE @homeSeg20 INT=0, @homeSeg19 INT=0, @homeSeg18 INT=0, @homeSeg17 INT=0, @homeSeg16 INT=0, @homeSeg15 INT=0, @homeBull INT=0;
  DECLARE @awaySeg20 INT=0, @awaySeg19 INT=0, @awaySeg18 INT=0, @awaySeg17 INT=0, @awaySeg16 INT=0, @awaySeg15 INT=0, @awayBull INT=0;
  DECLARE @homePoints INT=0, @awayPoints INT=0;
  DECLARE @turnNum INT = 1, @roundNum INT = 1;
  DECLARE @gameOver BIT = 0;
  DECLARE @marks INT, @pts INT;
  DECLARE @currentPID INT, @currentTSID INT;
  DECLARE @isClose BIT;

  WHILE @gameOver = 0 AND @roundNum <= 25
  BEGIN
    DECLARE @pIdx INT = 1;
    WHILE @pIdx <= 4 AND @gameOver = 0
    BEGIN
      SET @isClose = 0;

      IF @pIdx = 1 BEGIN SET @currentPID = @HomeP1; SET @currentTSID = @HomeTeamSeasonID; END
      ELSE IF @pIdx = 2 BEGIN SET @currentPID = @AwayP1; SET @currentTSID = @AwayTeamSeasonID; END
      ELSE IF @pIdx = 3 BEGIN SET @currentPID = @HomeP2; SET @currentTSID = @HomeTeamSeasonID; END
      ELSE BEGIN SET @currentPID = @AwayP2; SET @currentTSID = @AwayTeamSeasonID; END

      -- Random marks this turn (1-6, weighted toward 2-4)
      SET @marks = 1 + CAST(ABS(CHECKSUM(NEWID())) % 6 AS INT); -- 1-6
      SET @pts = 0;

      -- Distribute marks across open segments randomly
      -- Simplified: just add marks to a random open segment for the current team
      DECLARE @segChoice INT = ABS(CHECKSUM(NEWID())) % 7; -- 0-6 = 20,19,18,17,16,15,Bull
      DECLARE @currentVal INT, @opponentVal INT;
      DECLARE @addedMarks INT = @marks;
      DECLARE @turnSeg15 INT=0, @turnSeg16 INT=0, @turnSeg17 INT=0, @turnSeg18 INT=0, @turnSeg19 INT=0, @turnSeg20 INT=0, @turnBull INT=0;

      -- Get current values based on team
      IF @currentTSID = @HomeTeamSeasonID
      BEGIN
        IF @segChoice = 0 BEGIN SET @currentVal = @homeSeg20; SET @opponentVal = @awaySeg20; SET @homeSeg20 = @homeSeg20 + @addedMarks; IF @homeSeg20 > 3 AND @opponentVal < 3 SET @pts = (@homeSeg20 - 3) * 20; IF @homeSeg20 > 9 SET @homeSeg20 = 9; SET @turnSeg20 = @addedMarks; END
        ELSE IF @segChoice = 1 BEGIN SET @currentVal = @homeSeg19; SET @opponentVal = @awaySeg19; SET @homeSeg19 = @homeSeg19 + @addedMarks; IF @homeSeg19 > 3 AND @opponentVal < 3 SET @pts = (@homeSeg19 - 3) * 19; IF @homeSeg19 > 9 SET @homeSeg19 = 9; SET @turnSeg19 = @addedMarks; END
        ELSE IF @segChoice = 2 BEGIN SET @currentVal = @homeSeg18; SET @opponentVal = @awaySeg18; SET @homeSeg18 = @homeSeg18 + @addedMarks; IF @homeSeg18 > 3 AND @opponentVal < 3 SET @pts = (@homeSeg18 - 3) * 18; IF @homeSeg18 > 9 SET @homeSeg18 = 9; SET @turnSeg18 = @addedMarks; END
        ELSE IF @segChoice = 3 BEGIN SET @currentVal = @homeSeg17; SET @opponentVal = @awaySeg17; SET @homeSeg17 = @homeSeg17 + @addedMarks; IF @homeSeg17 > 3 AND @opponentVal < 3 SET @pts = (@homeSeg17 - 3) * 17; IF @homeSeg17 > 9 SET @homeSeg17 = 9; SET @turnSeg17 = @addedMarks; END
        ELSE IF @segChoice = 4 BEGIN SET @currentVal = @homeSeg16; SET @opponentVal = @awaySeg16; SET @homeSeg16 = @homeSeg16 + @addedMarks; IF @homeSeg16 > 3 AND @opponentVal < 3 SET @pts = (@homeSeg16 - 3) * 16; IF @homeSeg16 > 9 SET @homeSeg16 = 9; SET @turnSeg16 = @addedMarks; END
        ELSE IF @segChoice = 5 BEGIN SET @currentVal = @homeSeg15; SET @opponentVal = @awaySeg15; SET @homeSeg15 = @homeSeg15 + @addedMarks; IF @homeSeg15 > 3 AND @opponentVal < 3 SET @pts = (@homeSeg15 - 3) * 15; IF @homeSeg15 > 9 SET @homeSeg15 = 9; SET @turnSeg15 = @addedMarks; END
        ELSE BEGIN SET @currentVal = @homeBull; SET @opponentVal = @awayBull; SET @homeBull = @homeBull + @addedMarks; IF @homeBull > 3 AND @opponentVal < 3 SET @pts = (@homeBull - 3) * 25; IF @homeBull > 9 SET @homeBull = 9; SET @turnBull = @addedMarks; END

        IF @pts > 0 SET @homePoints = @homePoints + @pts;

        -- Check if home has closed all 7 segments (>=3 each) and has >= opponent points
        IF @homeSeg20 >= 3 AND @homeSeg19 >= 3 AND @homeSeg18 >= 3 AND @homeSeg17 >= 3
           AND @homeSeg16 >= 3 AND @homeSeg15 >= 3 AND @homeBull >= 3
           AND @homePoints >= @awayPoints
        BEGIN
          SET @gameOver = 1;
          SET @WinnerTSID = @HomeTeamSeasonID;
          SET @isClose = 1;
        END
      END
      ELSE -- Away team
      BEGIN
        IF @segChoice = 0 BEGIN SET @currentVal = @awaySeg20; SET @opponentVal = @homeSeg20; SET @awaySeg20 = @awaySeg20 + @addedMarks; IF @awaySeg20 > 3 AND @opponentVal < 3 SET @pts = (@awaySeg20 - 3) * 20; IF @awaySeg20 > 9 SET @awaySeg20 = 9; SET @turnSeg20 = @addedMarks; END
        ELSE IF @segChoice = 1 BEGIN SET @currentVal = @awaySeg19; SET @opponentVal = @homeSeg19; SET @awaySeg19 = @awaySeg19 + @addedMarks; IF @awaySeg19 > 3 AND @opponentVal < 3 SET @pts = (@awaySeg19 - 3) * 19; IF @awaySeg19 > 9 SET @awaySeg19 = 9; SET @turnSeg19 = @addedMarks; END
        ELSE IF @segChoice = 2 BEGIN SET @currentVal = @awaySeg18; SET @opponentVal = @homeSeg18; SET @awaySeg18 = @awaySeg18 + @addedMarks; IF @awaySeg18 > 3 AND @opponentVal < 3 SET @pts = (@awaySeg18 - 3) * 18; IF @awaySeg18 > 9 SET @awaySeg18 = 9; SET @turnSeg18 = @addedMarks; END
        ELSE IF @segChoice = 3 BEGIN SET @currentVal = @awaySeg17; SET @opponentVal = @homeSeg17; SET @awaySeg17 = @awaySeg17 + @addedMarks; IF @awaySeg17 > 3 AND @opponentVal < 3 SET @pts = (@awaySeg17 - 3) * 17; IF @awaySeg17 > 9 SET @awaySeg17 = 9; SET @turnSeg17 = @addedMarks; END
        ELSE IF @segChoice = 4 BEGIN SET @currentVal = @awaySeg16; SET @opponentVal = @homeSeg16; SET @awaySeg16 = @awaySeg16 + @addedMarks; IF @awaySeg16 > 3 AND @opponentVal < 3 SET @pts = (@awaySeg16 - 3) * 16; IF @awaySeg16 > 9 SET @awaySeg16 = 9; SET @turnSeg16 = @addedMarks; END
        ELSE IF @segChoice = 5 BEGIN SET @currentVal = @awaySeg15; SET @opponentVal = @homeSeg15; SET @awaySeg15 = @awaySeg15 + @addedMarks; IF @awaySeg15 > 3 AND @opponentVal < 3 SET @pts = (@awaySeg15 - 3) * 15; IF @awaySeg15 > 9 SET @awaySeg15 = 9; SET @turnSeg15 = @addedMarks; END
        ELSE BEGIN SET @currentVal = @awayBull; SET @opponentVal = @homeBull; SET @awayBull = @awayBull + @addedMarks; IF @awayBull > 3 AND @opponentVal < 3 SET @pts = (@awayBull - 3) * 25; IF @awayBull > 9 SET @awayBull = 9; SET @turnBull = @addedMarks; END

        IF @pts > 0 SET @awayPoints = @awayPoints + @pts;

        IF @awaySeg20 >= 3 AND @awaySeg19 >= 3 AND @awaySeg18 >= 3 AND @awaySeg17 >= 3
           AND @awaySeg16 >= 3 AND @awaySeg15 >= 3 AND @awayBull >= 3
           AND @awayPoints >= @homePoints
        BEGIN
          SET @gameOver = 1;
          SET @WinnerTSID = @AwayTeamSeasonID;
          SET @isClose = 1;
        END
      END

      -- Insert CricketTurn
      INSERT INTO CricketTurns (GameID, PlayerID, TeamSeasonID, TurnNumber, RoundNumber, DartsThrown,
        Seg15, Seg16, Seg17, Seg18, Seg19, Seg20, SegBull,
        Points, MarksScored, IsCricketClose, IsShanghaiBonus)
      VALUES (@GameID, @currentPID, @currentTSID, @turnNum, @roundNum, 3,
        @turnSeg15, @turnSeg16, @turnSeg17, @turnSeg18, @turnSeg19, @turnSeg20, @turnBull,
        @pts, @marks, @isClose, 0);

      SET @turnNum = @turnNum + 1;
      SET @pIdx = @pIdx + 1;
    END

    SET @roundNum = @roundNum + 1;
  END

  -- If timed out, random winner
  IF @gameOver = 0
  BEGIN
    IF ABS(CHECKSUM(NEWID())) % 2 = 0
      SET @WinnerTSID = @HomeTeamSeasonID
    ELSE
      SET @WinnerTSID = @AwayTeamSeasonID;
    SET @isClose = 1;
  END

  -- Update CricketState
  UPDATE CricketState SET
    Seg20=@homeSeg20, Seg19=@homeSeg19, Seg18=@homeSeg18, Seg17=@homeSeg17,
    Seg16=@homeSeg16, Seg15=@homeSeg15, SegBull=@homeBull, Points=@homePoints
  WHERE GameID=@GameID AND TeamSeasonID=@HomeTeamSeasonID;

  UPDATE CricketState SET
    Seg20=@awaySeg20, Seg19=@awaySeg19, Seg18=@awaySeg18, Seg17=@awaySeg17,
    Seg16=@awaySeg16, Seg15=@awaySeg15, SegBull=@awayBull, Points=@awayPoints
  WHERE GameID=@GameID AND TeamSeasonID=@AwayTeamSeasonID;

  -- Complete the game
  UPDATE Games SET Status = 'Completed', WinnerTeamSeasonID = @WinnerTSID, UpdatedAt = SYSUTCDATETIME()
  WHERE GameID = @GameID;
END
GO


-- ============================================================
-- Helper: Simulate a full 5-game match
-- ============================================================
IF OBJECT_ID('dbo.SimulateMatch', 'P') IS NOT NULL DROP PROCEDURE dbo.SimulateMatch;
GO

CREATE PROCEDURE dbo.SimulateMatch
  @MatchID INT,
  @SeasonID INT,
  @HomeTeamSeasonID INT,
  @AwayTeamSeasonID INT,
  @HomeP1 INT, @HomeP2 INT,
  @AwayP1 INT, @AwayP2 INT
AS
BEGIN
  SET NOCOUNT ON;

  -- Update match to InProgress
  UPDATE Matches SET Status = 'InProgress', UpdatedAt = SYSUTCDATETIME() WHERE MatchID = @MatchID;

  DECLARE @gid INT, @winner INT;
  DECLARE @homeGameWins INT = 0, @awayGameWins INT = 0;
  DECLARE @gameNum INT = 1;
  DECLARE @gameType NVARCHAR(20), @x01Target INT;

  -- Get format from SeasonGameFormats
  DECLARE format_cursor CURSOR FOR
    SELECT GameNumber, GameType, X01Target
    FROM SeasonGameFormats
    WHERE SeasonID = @SeasonID
    ORDER BY GameNumber;

  OPEN format_cursor;
  FETCH NEXT FROM format_cursor INTO @gameNum, @gameType, @x01Target;

  WHILE @@FETCH_STATUS = 0
  BEGIN
    -- Create game
    INSERT INTO Games (MatchID, GameType, GameNumber, X01Target, Status)
    VALUES (@MatchID, @gameType, @gameNum, @x01Target, 'InProgress');
    SET @gid = SCOPE_IDENTITY();

    IF @gameType = 'X01'
    BEGIN
      EXEC dbo.SimulateX01Game @gid, @HomeTeamSeasonID, @AwayTeamSeasonID,
        @HomeP1, @HomeP2, @AwayP1, @AwayP2, @x01Target, @winner OUTPUT;
    END
    ELSE IF @gameType IN ('Cricket', 'Shanghai')
    BEGIN
      EXEC dbo.SimulateCricketGame @gid, @HomeTeamSeasonID, @AwayTeamSeasonID,
        @HomeP1, @HomeP2, @AwayP1, @AwayP2, @winner OUTPUT;
    END

    IF @winner = @HomeTeamSeasonID SET @homeGameWins = @homeGameWins + 1;
    ELSE SET @awayGameWins = @awayGameWins + 1;

    FETCH NEXT FROM format_cursor INTO @gameNum, @gameType, @x01Target;
  END

  CLOSE format_cursor;
  DEALLOCATE format_cursor;

  -- Determine match winner
  DECLARE @matchWinner INT;
  IF @homeGameWins > @awayGameWins
    SET @matchWinner = @HomeTeamSeasonID;
  ELSE
    SET @matchWinner = @AwayTeamSeasonID;

  -- Complete match
  UPDATE Matches
  SET Status = 'Completed', WinnerTeamSeasonID = @matchWinner,
      HomeScore = @homeGameWins, AwayScore = @awayGameWins,
      UpdatedAt = SYSUTCDATETIME()
  WHERE MatchID = @MatchID;

  -- Update TeamSeasons GameWins
  UPDATE TeamSeasons SET GameWins = GameWins + @homeGameWins WHERE TeamSeasonID = @HomeTeamSeasonID;
  UPDATE TeamSeasons SET GameWins = GameWins + @awayGameWins WHERE TeamSeasonID = @AwayTeamSeasonID;

  -- Update W/L
  IF @matchWinner = @HomeTeamSeasonID
  BEGIN
    UPDATE TeamSeasons SET Wins = Wins + 1 WHERE TeamSeasonID = @HomeTeamSeasonID;
    UPDATE TeamSeasons SET Losses = Losses + 1 WHERE TeamSeasonID = @AwayTeamSeasonID;
  END
  ELSE
  BEGIN
    UPDATE TeamSeasons SET Wins = Wins + 1 WHERE TeamSeasonID = @AwayTeamSeasonID;
    UPDATE TeamSeasons SET Losses = Losses + 1 WHERE TeamSeasonID = @HomeTeamSeasonID;
  END
END
GO


-- ============================================================
-- 5. SIMULATE SEASON 1 — "Fall 2024"
-- ============================================================
PRINT '=== Creating Season 1: Fall 2024 ===';

INSERT INTO Seasons (SeasonName, StartDate, EndDate, Status, IsActive)
VALUES ('Fall 2024', '2024-09-01', '2024-12-15', 'Completed', 0);
DECLARE @s1 INT = SCOPE_IDENTITY();

-- Game format: G1=501, G2=Cricket, G3=501, G4=Cricket, G5=501
INSERT INTO SeasonGameFormats (SeasonID, GameNumber, GameType, X01Target, DoubleInRequired) VALUES
  (@s1, 1, 'X01', 501, 0),
  (@s1, 2, 'Cricket', NULL, 0),
  (@s1, 3, 'X01', 501, 0),
  (@s1, 4, 'Cricket', NULL, 0),
  (@s1, 5, 'X01', 501, 0);

-- Register all 4 teams
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (1, @s1); -- TS1
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (2, @s1); -- TS2
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (3, @s1); -- TS3
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (4, @s1); -- TS4

DECLARE @ts1_1 INT, @ts1_2 INT, @ts1_3 INT, @ts1_4 INT;
SELECT @ts1_1 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 1 AND SeasonID = @s1;
SELECT @ts1_2 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 2 AND SeasonID = @s1;
SELECT @ts1_3 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 3 AND SeasonID = @s1;
SELECT @ts1_4 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 4 AND SeasonID = @s1;

PRINT 'Season 1 teams registered.';

-- Round-robin: 4 teams = 6 matches (3 rounds of 2 matches each)
-- Round 1: 1v4, 2v3
-- Round 2: 1v3, 4v2
-- Round 3: 1v2, 3v4

DECLARE @mid INT;

-- Round 1, Match 1: Team1 vs Team4
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s1, @ts1_1, @ts1_4, 1, 'Scheduled');
SET @mid = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid, @s1, @ts1_1, @ts1_4, 1, 2, 7, 8;

-- Round 1, Match 2: Team2 vs Team3
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s1, @ts1_2, @ts1_3, 1, 'Scheduled');
SET @mid = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid, @s1, @ts1_2, @ts1_3, 3, 4, 5, 6;

-- Round 2, Match 1: Team1 vs Team3
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s1, @ts1_1, @ts1_3, 2, 'Scheduled');
SET @mid = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid, @s1, @ts1_1, @ts1_3, 1, 2, 5, 6;

-- Round 2, Match 2: Team4 vs Team2
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s1, @ts1_4, @ts1_2, 2, 'Scheduled');
SET @mid = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid, @s1, @ts1_4, @ts1_2, 7, 8, 3, 4;

-- Round 3, Match 1: Team1 vs Team2
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s1, @ts1_1, @ts1_2, 3, 'Scheduled');
SET @mid = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid, @s1, @ts1_1, @ts1_2, 1, 2, 3, 4;

-- Round 3, Match 2: Team3 vs Team4
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s1, @ts1_3, @ts1_4, 3, 'Scheduled');
SET @mid = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid, @s1, @ts1_3, @ts1_4, 5, 6, 7, 8;

-- Update season status
UPDATE Seasons SET Status = 'Completed' WHERE SeasonID = @s1;

PRINT 'Season 1 complete — 6 matches simulated (30 games total).';
GO


-- ============================================================
-- 6. SIMULATE SEASON 2 — "Spring 2025" (current/active)
-- ============================================================
PRINT '=== Creating Season 2: Spring 2025 ===';

INSERT INTO Seasons (SeasonName, StartDate, EndDate, Status, IsActive)
VALUES ('Spring 2025', '2025-01-15', '2025-05-15', 'RoundRobin', 1);
DECLARE @s2 INT = SCOPE_IDENTITY();

-- Game format: G1=501, G2=Cricket, G3=301, G4=Shanghai, G5=501
INSERT INTO SeasonGameFormats (SeasonID, GameNumber, GameType, X01Target, DoubleInRequired) VALUES
  (@s2, 1, 'X01', 501, 0),
  (@s2, 2, 'Cricket', NULL, 0),
  (@s2, 3, 'X01', 301, 0),
  (@s2, 4, 'Cricket', NULL, 0),  -- Using Cricket proc for Shanghai slot
  (@s2, 5, 'X01', 501, 0);

-- Register all 4 teams
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (1, @s2);
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (2, @s2);
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (3, @s2);
INSERT INTO TeamSeasons (TeamID, SeasonID) VALUES (4, @s2);

DECLARE @ts2_1 INT, @ts2_2 INT, @ts2_3 INT, @ts2_4 INT;
SELECT @ts2_1 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 1 AND SeasonID = @s2;
SELECT @ts2_2 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 2 AND SeasonID = @s2;
SELECT @ts2_3 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 3 AND SeasonID = @s2;
SELECT @ts2_4 = TeamSeasonID FROM TeamSeasons WHERE TeamID = 4 AND SeasonID = @s2;

PRINT 'Season 2 teams registered.';

DECLARE @mid2 INT;

-- Round 1: 1v4, 2v3
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s2, @ts2_1, @ts2_4, 1, 'Scheduled');
SET @mid2 = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid2, @s2, @ts2_1, @ts2_4, 1, 2, 7, 8;

INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s2, @ts2_2, @ts2_3, 1, 'Scheduled');
SET @mid2 = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid2, @s2, @ts2_2, @ts2_3, 3, 4, 5, 6;

-- Round 2: 1v3, 4v2
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s2, @ts2_1, @ts2_3, 2, 'Scheduled');
SET @mid2 = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid2, @s2, @ts2_1, @ts2_3, 1, 2, 5, 6;

INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s2, @ts2_4, @ts2_2, 2, 'Scheduled');
SET @mid2 = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid2, @s2, @ts2_4, @ts2_2, 7, 8, 3, 4;

-- Round 3: 1v2, 3v4
INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s2, @ts2_1, @ts2_2, 3, 'Scheduled');
SET @mid2 = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid2, @s2, @ts2_1, @ts2_2, 1, 2, 3, 4;

INSERT INTO Matches (SeasonID, HomeTeamSeasonID, AwayTeamSeasonID, RoundNumber, Status) VALUES (@s2, @ts2_3, @ts2_4, 3, 'Scheduled');
SET @mid2 = SCOPE_IDENTITY();
EXEC dbo.SimulateMatch @mid2, @s2, @ts2_3, @ts2_4, 5, 6, 7, 8;

PRINT 'Season 2 complete — 6 matches simulated (30 games total).';
GO


-- ============================================================
-- 7. SUMMARY
-- ============================================================
PRINT '';
PRINT '=== SIMULATION COMPLETE ===';
PRINT '';

SELECT 'Players' AS [Table], COUNT(*) AS [Count] FROM Players
UNION ALL SELECT 'Teams', COUNT(*) FROM Teams
UNION ALL SELECT 'Seasons', COUNT(*) FROM Seasons
UNION ALL SELECT 'TeamSeasons', COUNT(*) FROM TeamSeasons
UNION ALL SELECT 'Matches', COUNT(*) FROM Matches
UNION ALL SELECT 'Games', COUNT(*) FROM Games
UNION ALL SELECT 'Turns (X01)', COUNT(*) FROM Turns
UNION ALL SELECT 'CricketTurns', COUNT(*) FROM CricketTurns
UNION ALL SELECT 'CricketState', COUNT(*) FROM CricketState;

PRINT '';
PRINT '=== Season 1 Standings ===';
SELECT t.TeamName, ts.Wins, ts.Losses, ts.GameWins
FROM TeamSeasons ts
JOIN Teams t ON ts.TeamID = t.TeamID
JOIN Seasons s ON ts.SeasonID = s.SeasonID
WHERE s.SeasonName = 'Fall 2024'
ORDER BY ts.GameWins DESC;

PRINT '';
PRINT '=== Season 2 Standings ===';
SELECT t.TeamName, ts.Wins, ts.Losses, ts.GameWins
FROM TeamSeasons ts
JOIN Teams t ON ts.TeamID = t.TeamID
JOIN Seasons s ON ts.SeasonID = s.SeasonID
WHERE s.SeasonName = 'Spring 2025'
ORDER BY ts.GameWins DESC;

-- Cleanup helper procedures
DROP PROCEDURE IF EXISTS dbo.SimulateX01Game;
DROP PROCEDURE IF EXISTS dbo.SimulateCricketGame;
DROP PROCEDURE IF EXISTS dbo.SimulateMatch;

PRINT '';
PRINT 'Helper procedures cleaned up. Done!';
GO
