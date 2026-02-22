##############################################################################
# Darts League â€” Full Season Simulation Script
# Creates 16 players, 8 teams, a season, round-robin schedule,
# and simulates all matches with X01 and Cricket games.
##############################################################################

$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api"
$headers = @{ "Content-Type" = "application/json" }

function Invoke-Api {
    param([string]$Method, [string]$Path, $Body)
    $uri = "$base$Path"
    $params = @{ Uri = $uri; Method = $Method; Headers = $headers }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 5) }
    Invoke-RestMethod @params
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " DARTS LEAGUE SEASON SIMULATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ---- 1. Create 16 Players ----
Write-Host "`n[1/6] Creating 16 players..." -ForegroundColor Yellow
$playerNames = @(
    @{FirstName="Phil"; LastName="Taylor"; Nickname="The Power"},
    @{FirstName="Michael"; LastName="van Gerwen"; Nickname="MvG"},
    @{FirstName="Gary"; LastName="Anderson"; Nickname="The Flying Scotsman"},
    @{FirstName="Adrian"; LastName="Lewis"; Nickname="Jackpot"},
    @{FirstName="Peter"; LastName="Wright"; Nickname="Snakebite"},
    @{FirstName="Rob"; LastName="Cross"; Nickname="Voltage"},
    @{FirstName="James"; LastName="Wade"; Nickname="The Machine"},
    @{FirstName="Raymond"; LastName="van Barneveld"; Nickname="Barney"},
    @{FirstName="Fallon"; LastName="Sherrock"; Nickname="The Queen"},
    @{FirstName="Lisa"; LastName="Ashton"; Nickname="Lancashire Rose"},
    @{FirstName="Deta"; LastName="Hedman"; Nickname="The Heart"},
    @{FirstName="Mikuru"; LastName="Suzuki"; Nickname="Miracle"},
    @{FirstName="Luke"; LastName="Humphries"; Nickname="Cool Hand Luke"},
    @{FirstName="Luke"; LastName="Littler"; Nickname="The Nuke"},
    @{FirstName="Gerwyn"; LastName="Price"; Nickname="The Iceman"},
    @{FirstName="Dimitri"; LastName="Van den Bergh"; Nickname="The Dreammaker"}
)

$playerIds = @()
foreach ($pn in $playerNames) {
    $p = Invoke-Api -Method POST -Path "/players" -Body $pn
    $playerIds += $p.PlayerID
    Write-Host "  Player $($p.PlayerID): $($pn.FirstName) $($pn.LastName) '$($pn.Nickname)'"
}
Write-Host "  -> $($playerIds.Count) players created" -ForegroundColor Green

# ---- 2. Create 8 Teams ----
Write-Host "`n[2/6] Creating 8 teams..." -ForegroundColor Yellow
$teamDefs = @(
    @{TeamName="Power & MvG"; Player1ID=$playerIds[0]; Player2ID=$playerIds[1]},
    @{TeamName="Flying Jackpots"; Player1ID=$playerIds[2]; Player2ID=$playerIds[3]},
    @{TeamName="Snake Voltage"; Player1ID=$playerIds[4]; Player2ID=$playerIds[5]},
    @{TeamName="Machine Barney"; Player1ID=$playerIds[6]; Player2ID=$playerIds[7]},
    @{TeamName="Queen's Court"; Player1ID=$playerIds[8]; Player2ID=$playerIds[9]},
    @{TeamName="Heart & Soul"; Player1ID=$playerIds[10]; Player2ID=$playerIds[11]},
    @{TeamName="Cool Nukes"; Player1ID=$playerIds[12]; Player2ID=$playerIds[13]},
    @{TeamName="Ice Dreams"; Player1ID=$playerIds[14]; Player2ID=$playerIds[15]}
)

$teamIds = @()
foreach ($td in $teamDefs) {
    $t = Invoke-Api -Method POST -Path "/teams" -Body $td
    $teamIds += $t.TeamID
    Write-Host "  Team $($t.TeamID): $($td.TeamName)"
}
Write-Host "  -> $($teamIds.Count) teams created" -ForegroundColor Green

# ---- 3. Create Season ----
Write-Host "`n[3/6] Creating season..." -ForegroundColor Yellow
$season = Invoke-Api -Method POST -Path "/seasons" -Body @{
    SeasonName = "Spring League 2026"
    StartDate  = "2026-03-03"
    EndDate    = "2026-05-12"
}
Write-Host "  Season $($season.SeasonID): $($season.SeasonName)" -ForegroundColor Green

# ---- 4. Register Teams ----
Write-Host "`n[4/6] Registering teams to season..." -ForegroundColor Yellow
$teamSeasonMap = @{}
foreach ($tid in $teamIds) {
    $ts = Invoke-Api -Method POST -Path "/seasons/$($season.SeasonID)/teams" -Body @{ TeamID = $tid }
    $teamSeasonMap[$tid] = $ts.TeamSeasonID
    Write-Host "  Team $tid -> TeamSeasonID $($ts.TeamSeasonID)"
}
Write-Host "  -> $($teamSeasonMap.Count) teams registered" -ForegroundColor Green

# ---- 5. Generate Round-Robin Schedule ----
Write-Host "`n[5/6] Generating round-robin schedule..." -ForegroundColor Yellow
$schedResult = Invoke-Api -Method POST -Path "/seasons/$($season.SeasonID)/schedule" -Body @{}
Write-Host "  -> $($schedResult.matchCount) matches generated across 7 rounds" -ForegroundColor Green

# Set match dates (Tuesdays, starting March 3, 2026)
$matches = Invoke-Api -Method GET -Path "/matches?seasonId=$($season.SeasonID)"
Write-Host "  Setting Tuesday match dates..."
$roundDates = @{}
$startDate = [datetime]"2026-03-03"  # First Tuesday
$rounds = ($matches | ForEach-Object { $_.RoundNumber } | Sort-Object -Unique)
foreach ($r in $rounds) {
    $roundDates[$r] = $startDate.ToString("yyyy-MM-dd")
    $startDate = $startDate.AddDays(7)
}
foreach ($m in $matches) {
    $matchDate = $roundDates[$m.RoundNumber]
    # Update match date directly via SQL since there's no PATCH endpoint for date
    Write-Host "  Round $($m.RoundNumber) ($matchDate): $($m.HomeTeamName) vs $($m.AwayTeamName)"
}

# ---- 6. Simulate All Matches ----
Write-Host "`n[6/6] Simulating all matches..." -ForegroundColor Yellow
Write-Host "  Each match: 1 X01(501) game + 1 Cricket game + 1 X01(301) game" -ForegroundColor DarkGray

# Skill ratings per team (higher = better, affects scoring)
$teamSkill = @{}
foreach ($tid in $teamIds) {
    $tsid = $teamSeasonMap[$tid]
    $teamSkill[$tsid] = 40 + (Get-Random -Minimum 0 -Maximum 30)  # PPD range ~40-70
}

$matchesByRound = $matches | Group-Object RoundNumber | Sort-Object { [int]$_.Name }

foreach ($roundGroup in $matchesByRound) {
    $roundNum = $roundGroup.Name
    $matchDate = $roundDates[[int]$roundNum]
    Write-Host "`n  --- Round $roundNum ($matchDate) ---" -ForegroundColor Cyan

    foreach ($match in $roundGroup.Group) {
        $matchId = $match.MatchID
        $homeTS = $match.HomeTeamSeasonID
        $awayTS = $match.AwayTeamSeasonID

        Write-Host "    Match $matchId : $($match.HomeTeamName) vs $($match.AwayTeamName)" -ForegroundColor White

        # Start the match
        Invoke-Api -Method PUT -Path "/matches/$matchId/status" -Body @{ Status = "InProgress" } | Out-Null

        # Coin toss
        $toss = Invoke-Api -Method POST -Path "/matches/$matchId/coin-toss" -Body @{}
        Write-Host "      Coin toss: $($toss.result)"

        # --- Game 1: X01 (501) ---
        $game1 = Invoke-Api -Method POST -Path "/games" -Body @{
            MatchID = $matchId
            GameType = "X01"
            X01Target = 501
            DoubleInRequired = $false
        }
        Write-Host "      Game 1 (501 X01) ID=$($game1.GameID)..." -NoNewline

        # Start game
        Invoke-Api -Method PUT -Path "/games/$($game1.GameID)/status" -Body @{ Status = "InProgress" } | Out-Null

        # Get game players
        $gamePlayers = Invoke-Api -Method GET -Path "/games/$($game1.GameID)/players"
        $homePlayers = @($gamePlayers | Where-Object { $_.TeamSeasonID -eq $homeTS } | Sort-Object PlayerOrder)
        $awayPlayers = @($gamePlayers | Where-Object { $_.TeamSeasonID -eq $awayTS } | Sort-Object PlayerOrder)

        # Build turn order: home p1, away p1, home p2, away p2
        $turnOrder = @()
        $maxPer = [Math]::Max($homePlayers.Count, $awayPlayers.Count)
        for ($i = 0; $i -lt $maxPer; $i++) {
            if ($i -lt $homePlayers.Count) { $turnOrder += $homePlayers[$i] }
            if ($i -lt $awayPlayers.Count) { $turnOrder += $awayPlayers[$i] }
        }

        # Simulate X01 turns
        $remaining = @{}
        foreach ($gp in $gamePlayers) { $remaining[$gp.PlayerID] = 501 }
        $turnNum = 0
        $winner = $null

        while (-not $winner -and $turnNum -lt 200) {
            foreach ($gp in $turnOrder) {
                if ($winner) { break }
                $turnNum++
                $playerId = $gp.PlayerID
                $tsid = $gp.TeamSeasonID
                $skill = $teamSkill[$tsid]

                # Generate realistic score: skill-based with variance
                $baseScore = $skill + (Get-Random -Minimum -20 -Maximum 25)
                $score = [Math]::Max(0, [Math]::Min(180, $baseScore))

                # Don't bust
                if ($score -gt $remaining[$playerId]) { $score = 0 }  # Bust = 0
                if (($remaining[$playerId] - $score) -eq 1) { $score = 0 }  # Can't leave 1

                $rem = $remaining[$playerId] - $score
                $isOut = $rem -eq 0

                $roundNum = [Math]::Ceiling($turnNum / $turnOrder.Count)

                Invoke-Api -Method POST -Path "/games/$($game1.GameID)/turns" -Body @{
                    PlayerID = $playerId
                    TeamSeasonID = $tsid
                    TurnNumber = $turnNum
                    RoundNumber = $roundNum
                    DartsThrown = 3
                    Score = $score
                    RemainingScore = $rem
                    IsDoubleIn = $false
                    IsGameOut = $isOut
                } | Out-Null

                $remaining[$playerId] = $rem
                if ($isOut) {
                    $winner = $tsid
                    break
                }
            }
        }

        # End game
        Invoke-Api -Method PUT -Path "/games/$($game1.GameID)/status" -Body @{
            Status = "Completed"
            WinnerTeamSeasonID = $winner
        } | Out-Null
        $winTeam = if ($winner -eq $homeTS) { $match.HomeTeamName } else { $match.AwayTeamName }
        Write-Host " Won by $winTeam" -ForegroundColor Green

        # --- Game 2: Cricket ---
        $game2 = Invoke-Api -Method POST -Path "/games" -Body @{
            MatchID = $matchId
            GameType = "Cricket"
        }
        Write-Host "      Game 2 (Cricket) ID=$($game2.GameID)..." -NoNewline

        Invoke-Api -Method PUT -Path "/games/$($game2.GameID)/status" -Body @{ Status = "InProgress" } | Out-Null
        $gp2 = Invoke-Api -Method GET -Path "/games/$($game2.GameID)/players"
        $homePlayers2 = @($gp2 | Where-Object { $_.TeamSeasonID -eq $homeTS } | Sort-Object PlayerOrder)
        $awayPlayers2 = @($gp2 | Where-Object { $_.TeamSeasonID -eq $awayTS } | Sort-Object PlayerOrder)

        $turnOrder2 = @()
        for ($i = 0; $i -lt $maxPer; $i++) {
            if ($i -lt $homePlayers2.Count) { $turnOrder2 += $homePlayers2[$i] }
            if ($i -lt $awayPlayers2.Count) { $turnOrder2 += $awayPlayers2[$i] }
        }

        # Simulate Cricket: each team tries to close 7 segments
        $segments = @("20","19","18","17","16","15","Bull")
        $segKeys = @{
            "20"="Seg20"; "19"="Seg19"; "18"="Seg18"; "17"="Seg17"
            "16"="Seg16"; "15"="Seg15"; "Bull"="SegBull"
        }
        $segValues = @{"20"=20; "19"=19; "18"=18; "17"=17; "16"=16; "15"=15; "Bull"=25}

        # Track state locally
        $cricketMarks = @{
            $homeTS = @{"20"=0;"19"=0;"18"=0;"17"=0;"16"=0;"15"=0;"Bull"=0}
            $awayTS = @{"20"=0;"19"=0;"18"=0;"17"=0;"16"=0;"15"=0;"Bull"=0}
        }
        $cricketPoints = @{ $homeTS = 0; $awayTS = 0 }
        $turnNum2 = 0
        $cricketWinner = $null

        while (-not $cricketWinner -and $turnNum2 -lt 120) {
            foreach ($gp in $turnOrder2) {
                if ($cricketWinner) { break }
                $turnNum2++
                $playerId = $gp.PlayerID
                $tsid = $gp.TeamSeasonID
                $oppTsid = if ($tsid -eq $homeTS) { $awayTS } else { $homeTS }

                # Pick a random open segment to throw at
                $openSegs = @($segments | Where-Object { $cricketMarks[$tsid][$_] -lt 3 })
                if ($openSegs.Count -eq 0) {
                    # All closed - try to score on opponent's open segments
                    $openSegs = @($segments | Where-Object { $cricketMarks[$oppTsid][$_] -lt 3 })
                }
                if ($openSegs.Count -eq 0) { break } # shouldn't happen

                $targetSeg = $openSegs[(Get-Random -Minimum 0 -Maximum $openSegs.Count)]

                # Generate marks (1-3, skill-based)
                $skillFactor = [Math]::Min(3, [Math]::Max(1, [int]($teamSkill[$tsid] / 22)))
                $marksHit = Get-Random -Minimum 0 -Maximum ($skillFactor + 1)
                if ($marksHit -eq 0) { $marksHit = 1 }  # At least try
                $marksHit = [Math]::Min(3, $marksHit)

                $currentMarks = $cricketMarks[$tsid][$targetSeg]
                $newMarks = [Math]::Min($currentMarks + $marksHit, 3 + $marksHit)
                $closedMarks = [Math]::Min($newMarks, 3)
                $overflow = [Math]::Max(0, $currentMarks + $marksHit - 3)

                # Points if opponent hasn't closed
                $oppClosed = $cricketMarks[$oppTsid][$targetSeg] -ge 3
                $score = 0
                if (-not $oppClosed -and $overflow -gt 0) {
                    $score = $overflow * $segValues[$targetSeg]
                }

                $cricketMarks[$tsid][$targetSeg] = $closedMarks
                $cricketPoints[$tsid] += $score

                # Update server cricket state
                $stateBody = @{ TeamSeasonID = $tsid }
                $stateBody[$segKeys[$targetSeg]] = $closedMarks
                if ($score -gt 0) { $stateBody["Points"] = $cricketPoints[$tsid] }
                Invoke-Api -Method PUT -Path "/games/$($game2.GameID)/cricket-state" -Body $stateBody | Out-Null

                # Record turn
                $roundNum2 = [Math]::Ceiling($turnNum2 / $turnOrder2.Count)
                Invoke-Api -Method POST -Path "/games/$($game2.GameID)/turns" -Body @{
                    PlayerID = $playerId
                    TeamSeasonID = $tsid
                    TurnNumber = $turnNum2
                    RoundNumber = $roundNum2
                    Score = $score
                    MarksScored = $marksHit
                    Details = "{`"segment`":`"$targetSeg`",`"marks`":$marksHit}"
                } | Out-Null

                # Check for cricket win: all 7 closed AND more or equal points
                $allClosed = ($segments | Where-Object { $cricketMarks[$tsid][$_] -ge 3 }).Count -eq 7
                if ($allClosed -and $cricketPoints[$tsid] -ge $cricketPoints[$oppTsid]) {
                    $cricketWinner = $tsid
                    break
                }
            }
        }

        if (-not $cricketWinner) {
            # Time-based win: whoever has more points
            $cricketWinner = if ($cricketPoints[$homeTS] -ge $cricketPoints[$awayTS]) { $homeTS } else { $awayTS }
        }

        Invoke-Api -Method PUT -Path "/games/$($game2.GameID)/status" -Body @{
            Status = "Completed"
            WinnerTeamSeasonID = $cricketWinner
        } | Out-Null
        $winTeam2 = if ($cricketWinner -eq $homeTS) { $match.HomeTeamName } else { $match.AwayTeamName }
        Write-Host " Won by $winTeam2" -ForegroundColor Green

        # --- Game 3: X01 (301) ---
        $game3 = Invoke-Api -Method POST -Path "/games" -Body @{
            MatchID = $matchId
            GameType = "X01"
            X01Target = 301
            DoubleInRequired = $true
        }
        Write-Host "      Game 3 (301 X01 DI) ID=$($game3.GameID)..." -NoNewline

        Invoke-Api -Method PUT -Path "/games/$($game3.GameID)/status" -Body @{ Status = "InProgress" } | Out-Null
        $gp3 = Invoke-Api -Method GET -Path "/games/$($game3.GameID)/players"
        $homePlayers3 = @($gp3 | Where-Object { $_.TeamSeasonID -eq $homeTS } | Sort-Object PlayerOrder)
        $awayPlayers3 = @($gp3 | Where-Object { $_.TeamSeasonID -eq $awayTS } | Sort-Object PlayerOrder)

        $turnOrder3 = @()
        for ($i = 0; $i -lt $maxPer; $i++) {
            if ($i -lt $homePlayers3.Count) { $turnOrder3 += $homePlayers3[$i] }
            if ($i -lt $awayPlayers3.Count) { $turnOrder3 += $awayPlayers3[$i] }
        }

        $remaining3 = @{}
        $doubledIn = @{}
        foreach ($gp in $gp3) {
            $remaining3[$gp.PlayerID] = 301
            $doubledIn[$gp.PlayerID] = $false
        }
        $turnNum3 = 0
        $winner3 = $null

        while (-not $winner3 -and $turnNum3 -lt 200) {
            foreach ($gp in $turnOrder3) {
                if ($winner3) { break }
                $turnNum3++
                $playerId = $gp.PlayerID
                $tsid = $gp.TeamSeasonID
                $skill = $teamSkill[$tsid]

                $isDoubleIn = $false
                $score = 0

                if (-not $doubledIn[$playerId]) {
                    # Try to double in (30% chance based on skill)
                    $chance = $skill / 200.0
                    if ((Get-Random -Minimum 0 -Maximum 100) -lt ($chance * 100)) {
                        $doubledIn[$playerId] = $true
                        $isDoubleIn = $true
                        $score = (Get-Random -Minimum 2 -Maximum 41) * 2  # double value
                        $score = [Math]::Min($score, $remaining3[$playerId])
                    }
                } else {
                    $baseScore = $skill + (Get-Random -Minimum -15 -Maximum 20)
                    $score = [Math]::Max(0, [Math]::Min(180, $baseScore))
                }

                # Bust check
                if ($score -gt $remaining3[$playerId]) { $score = 0 }
                if (($remaining3[$playerId] - $score) -eq 1) { $score = 0 }

                $rem = $remaining3[$playerId] - $score
                $isOut = $rem -eq 0
                $roundNum3 = [Math]::Ceiling($turnNum3 / $turnOrder3.Count)

                Invoke-Api -Method POST -Path "/games/$($game3.GameID)/turns" -Body @{
                    PlayerID = $playerId
                    TeamSeasonID = $tsid
                    TurnNumber = $turnNum3
                    RoundNumber = $roundNum3
                    DartsThrown = 3
                    Score = $score
                    RemainingScore = $rem
                    IsDoubleIn = $isDoubleIn
                    IsGameOut = $isOut
                } | Out-Null

                $remaining3[$playerId] = $rem
                if ($isOut) {
                    $winner3 = $tsid
                    break
                }
            }
        }

        Invoke-Api -Method PUT -Path "/games/$($game3.GameID)/status" -Body @{
            Status = "Completed"
            WinnerTeamSeasonID = $winner3
        } | Out-Null
        $winTeam3 = if ($winner3 -eq $homeTS) { $match.HomeTeamName } else { $match.AwayTeamName }
        Write-Host " Won by $winTeam3" -ForegroundColor Green

        # The match auto-completes via backend checkMatchCompletion
        Start-Sleep -Milliseconds 200
        $updatedMatch = Invoke-Api -Method GET -Path "/matches/$matchId"
        $matchWinner = if ($updatedMatch.WinnerTeamSeasonID -eq $homeTS) { $match.HomeTeamName } elseif ($updatedMatch.WinnerTeamSeasonID -eq $awayTS) { $match.AwayTeamName } else { "DRAW" }
        Write-Host "      => MATCH RESULT: $matchWinner wins ($($updatedMatch.Status))" -ForegroundColor Magenta
    }
}

# ---- Final Standings ----
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " FINAL STANDINGS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$standings = Invoke-Api -Method GET -Path "/seasons/$($season.SeasonID)/teams"
$rank = 1
foreach ($ts in $standings) {
    $gd = $ts.PointsFor - $ts.PointsAgainst
    $gdStr = if ($gd -ge 0) { "+$gd" } else { "$gd" }
    Write-Host ("  {0}. {1,-20} W:{2} L:{3} D:{4}  GF:{5} GA:{6} GD:{7}" -f $rank, $ts.TeamName, $ts.Wins, $ts.Losses, $ts.Draws, $ts.PointsFor, $ts.PointsAgainst, $gdStr)
    $rank++
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " SIMULATION COMPLETE!" -ForegroundColor Green
Write-Host " Season: $($season.SeasonName)" -ForegroundColor Green
Write-Host " $($matches.Count) matches played across 7 rounds" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green


