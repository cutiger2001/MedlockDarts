param(
    [string]$BaseUrl = "http://localhost:3001/api",
    [string]$SeasonName = "Season Generation Test 2026-06-09",
    [string]$StartDate = "2026-06-09",
    [string]$EndDate = "2026-07-28",
    [string]$SetupPassword = "180Allday!"
)

$ErrorActionPreference = "Stop"

$headers = @{ "Content-Type" = "application/json" }
$seedPlayers = @(
    @{ FirstName = "Todd"; LastName = "Anderson" },
    @{ FirstName = "Mark"; LastName = "Bennett" },
    @{ FirstName = "Mike"; LastName = "Carter" },
    @{ FirstName = "Paul"; LastName = "Dawson" },
    @{ FirstName = "Brian"; LastName = "Evans" },
    @{ FirstName = "Neil"; LastName = "Foster" },
    @{ FirstName = "Kevin"; LastName = "Grady" },
    @{ FirstName = "Nick"; LastName = "Harris" },
    @{ FirstName = "Scott"; LastName = "Irwin" },
    @{ FirstName = "Jason"; LastName = "Jones" },
    @{ FirstName = "Chris"; LastName = "Knight" },
    @{ FirstName = "Matt"; LastName = "Lewis" },
    @{ FirstName = "Ryan"; LastName = "Morris" },
    @{ FirstName = "Steve"; LastName = "Nash" },
    @{ FirstName = "Dan"; LastName = "Owens" },
    @{ FirstName = "Brad"; LastName = "Parker" }
)

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        $Body = $null
    )

    $uri = "$BaseUrl$Path"
    $params = @{
        Uri = $uri
        Method = $Method
        Headers = $headers
    }

    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    Invoke-RestMethod @params
}

function Normalize-Collection {
    param(
        [Parameter(ValueFromPipeline = $true)]
        $InputObject
    )

    if ($null -eq $InputObject) {
        return @()
    }

    if ($InputObject -is [System.Array]) {
        if ($InputObject.Length -eq 1 -and $InputObject.GetValue(0) -is [System.Array]) {
            return @($InputObject.GetValue(0))
        }
        return @($InputObject)
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
        return @($InputObject)
    }

    return @($InputObject)
}

function Get-OrCreateTeam {
    param(
        [array]$ExistingTeams,
        [object]$PlayerA,
        [object]$PlayerB
    )

    $existing = $ExistingTeams | Where-Object {
        ($_.Player1ID -eq $PlayerA.PlayerID -and $_.Player2ID -eq $PlayerB.PlayerID) -or
        ($_.Player1ID -eq $PlayerB.PlayerID -and $_.Player2ID -eq $PlayerA.PlayerID)
    } | Select-Object -First 1

    if ($existing) {
        return $existing
    }

    $teamName = "$($PlayerA.FirstName) $($PlayerA.LastName) & $($PlayerB.FirstName) $($PlayerB.LastName)"
    $created = Invoke-Api -Method POST -Path "/teams" -Body @{
        TeamName = $teamName
        Player1ID = $PlayerA.PlayerID
        Player2ID = $PlayerB.PlayerID
    }

    return $created
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Season Generation Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n[1/6] Checking API health..." -ForegroundColor Yellow
$health = Invoke-Api -Method GET -Path "/health"
Write-Host "  API is up at $BaseUrl ($($health.status))" -ForegroundColor Green

Write-Host "`n[2/6] Loading active players..." -ForegroundColor Yellow
$players = Normalize-Collection (Invoke-Api -Method GET -Path "/players")
if ($players.Count -lt 16) {
    Write-Host "  Only $($players.Count) active player(s) found. Seeding additional players for the test..." -ForegroundColor DarkYellow
    foreach ($seed in $seedPlayers) {
        if ($players.Count -ge 16) { break }
        $exists = $players | Where-Object {
            $_.FirstName -eq $seed.FirstName -and $_.LastName -eq $seed.LastName
        } | Select-Object -First 1
        if ($exists) { continue }

        $created = Invoke-Api -Method POST -Path "/players" -Body $seed
        $players += $created
        Write-Host "   + Added $($created.FirstName) $($created.LastName)" -ForegroundColor Green
    }
}

if ($players.Count -lt 16) {
    throw "Need at least 16 active players to create 8 teams. Found $($players.Count) after seeding."
}

$selectedPlayers = @($players | Select-Object -First 16)
Write-Host "  Using these 16 players:" -ForegroundColor DarkGray
foreach ($player in $selectedPlayers) {
    Write-Host "   - $($player.FirstName) $($player.LastName)"
}

Write-Host "`n[3/6] Reusing or creating 8 teams..." -ForegroundColor Yellow
$existingTeams = Normalize-Collection (Invoke-Api -Method GET -Path "/teams")
$teamIds = @()
$teamObjects = @()
for ($i = 0; $i -lt 16; $i += 2) {
    $playerA = $selectedPlayers[$i]
    $playerB = $selectedPlayers[$i + 1]
    $team = Get-OrCreateTeam -ExistingTeams $existingTeams -PlayerA $playerA -PlayerB $playerB
    $teamIds += $team.TeamID
    $teamObjects += $team
    Write-Host "  Team $($team.TeamID): $($playerA.FirstName) $($playerA.LastName) & $($playerB.FirstName) $($playerB.LastName)" -ForegroundColor Green
    if (-not ($existingTeams | Where-Object { $_.TeamID -eq $team.TeamID })) {
        $existingTeams += $team
    }
}

Write-Host "`n[4/6] Creating season..." -ForegroundColor Yellow
$season = Invoke-Api -Method POST -Path "/seasons" -Body @{
    SeasonName = $SeasonName
    StartDate = $StartDate
    EndDate = $EndDate
    setupPassword = $SetupPassword
}
Write-Host "  Season $($season.SeasonID): $($season.SeasonName)" -ForegroundColor Green

Write-Host "`n[5/6] Registering teams and generating schedule..." -ForegroundColor Yellow
$teamSeasons = @()
foreach ($teamId in $teamIds) {
    $teamSeason = Invoke-Api -Method POST -Path "/seasons/$($season.SeasonID)/teams" -Body @{
        TeamID = $teamId
        setupPassword = $SetupPassword
    }
    $teamSeasons += $teamSeason
    Write-Host "  Team $teamId -> TeamSeasonID $($teamSeason.TeamSeasonID)" -ForegroundColor Green
}

$scheduleResult = Invoke-Api -Method POST -Path "/seasons/$($season.SeasonID)/schedule" -Body @{
    setupPassword = $SetupPassword
}
Write-Host "  Schedule created with $($scheduleResult.matchesCreated) matches" -ForegroundColor Green

Write-Host "`n[6/6] Inserting make-up round halfway through the season..." -ForegroundColor Yellow
$makeUpDate = "2026-07-02"
$makeUpMatch = Invoke-Api -Method POST -Path "/seasons/$($season.SeasonID)/make-up-round" -Body @{
    MatchDate = $makeUpDate
    setupPassword = $SetupPassword
}
Write-Host "  Make-up round created: Match $($makeUpMatch.MatchID) on $makeUpDate" -ForegroundColor Green

Write-Host "`nSchedule preview:" -ForegroundColor Cyan
$matches = Normalize-Collection (Invoke-Api -Method GET -Path "/matches?seasonId=$($season.SeasonID)")
$orderedMatches = $matches | Sort-Object @{ Expression = { if ($_.MatchDate) { [datetime]$_.MatchDate } else { [datetime]'9999-12-31' } } }, RoundNumber, MatchID
foreach ($match in $orderedMatches) {
    $label = if ($match.PlayoffRound -eq "MakeUp") { "Make-Up Round" } else { "Round $($match.RoundNumber)" }
    $dateLabel = if ($match.MatchDate) { ([string]$match.MatchDate).Substring(0, 10) } else { "TBD" }
    if ($match.PlayoffRound -eq "MakeUp") {
        Write-Host ("  {0} | {1,-13} | Reserved make-up week" -f $dateLabel, $label)
    } else {
        Write-Host ("  {0} | {1,-13} | {2} vs {3}" -f $dateLabel, $label, $match.HomeTeamName, $match.AwayTeamName)
    }
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host " Season generation test complete" -ForegroundColor Green
Write-Host " SeasonID: $($season.SeasonID)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
