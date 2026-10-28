$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BaselinePath = Join-Path $RepoRoot "supabase\local-schema-baseline.sql"
$ConflictMigrationPath = Join-Path $RepoRoot "supabase\migrations\20261028060000_guest_billing_conflict_http_status.sql"
$ConfigPath = Join-Path $RepoRoot "supabase\config.toml"
$FunctionsSourcePath = Join-Path $RepoRoot "supabase\functions"
$SupabaseCli = Join-Path $RepoRoot "node_modules\.bin\supabase.cmd"

if (-not (Test-Path $SupabaseCli)) {
  throw "Supabase CLI not found. From the repository root, run 'npm install' and retry."
}
if (-not (Test-Path $BaselinePath)) {
  throw @"
Local schema baseline not found:
  $BaselinePath

Create it first using the schema-only dump command in docs/guest-tabs-local-migration-test.md.
Do not use --data-only, and do not commit the dump.
"@
}
if (-not (Test-Path $ConflictMigrationPath)) {
  throw "Guest-billing conflict migration not found: $ConflictMigrationPath. Switch to fix/guest-billing-conflict-http-status first."
}
if (-not (Test-Path $ConfigPath)) {
  throw "Supabase config not found: $ConfigPath"
}
if (-not (Test-Path $FunctionsSourcePath)) {
  throw "Supabase Edge Functions directory not found: $FunctionsSourcePath"
}

$BaselineSql = Get-Content -Raw -Path $BaselinePath
if ([string]::IsNullOrWhiteSpace($BaselineSql)) {
  throw "The local schema baseline is empty. Recreate it with the schema-only dump command."
}
if ($BaselineSql -match "(?m)^\s*COPY\s+\S+\s*\(") {
  throw "The baseline looks like it contains row data (COPY statements). Recreate it without --data-only; do not use production data for this test."
}

$TempRoot = Join-Path $env:TEMP ("khaavio-guest-billing-local-" + [guid]::NewGuid().ToString("N"))
$TempSupabase = Join-Path $TempRoot "supabase"
$TempMigrations = Join-Path $TempSupabase "migrations"
$TempFunctions = Join-Path $TempSupabase "functions"
$StackAttempted = $false
$Failure = $null
$UniqueProjectId = $null

try {
  New-Item -ItemType Directory -Path $TempMigrations -Force | Out-Null
  New-Item -ItemType Directory -Path $TempFunctions -Force | Out-Null
  # The copied config declares Edge Functions; copy their source so the CLI can resolve
  # every configured function path while starting this disposable migration-test stack.
  Get-ChildItem -LiteralPath $FunctionsSourcePath -Force | Copy-Item -Destination $TempFunctions -Recurse -Force
  $ConfigText = Get-Content -Raw -Path $ConfigPath
  if ($ConfigText -notmatch '(?m)^project_id\s*=\s*"[^"]+"') {
    throw "Could not safely set a unique local project_id in the copied Supabase config."
  }
  $UniqueProjectId = "khaavio-guest-test-" + [guid]::NewGuid().ToString("N").Substring(0, 8)
  $ConfigText = [regex]::Replace(
    $ConfigText,
    '(?m)^project_id\s*=\s*"[^"]+"',
    ('project_id = "' + $UniqueProjectId + '"'),
    1
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $TempSupabase "config.toml"),
    $ConfigText,
    [System.Text.UTF8Encoding]::new($false)
  )

  [System.IO.File]::WriteAllText(
    (Join-Path $TempSupabase "seed.sql"),
    ("-- Intentionally empty: no production data is copied into this test database." + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )

  # This disposable workspace uses a current schema snapshot plus the new
  # conflict-status migration. It intentionally does not replay historical
  # migrations because the snapshot already includes the deployed guest-billing functions.
  [System.IO.File]::WriteAllText(
    (Join-Path $TempMigrations "20261027000000_local_schema_baseline.sql"),
    $BaselineSql,
    [System.Text.UTF8Encoding]::new($false)
  )
  Copy-Item -LiteralPath $ConflictMigrationPath -Destination (Join-Path $TempMigrations "20261028060000_guest_billing_conflict_http_status.sql")

  Push-Location $TempRoot
  try {
    Write-Host "Starting disposable local Supabase stack: $UniqueProjectId" -ForegroundColor Cyan
    Write-Host "All reset commands run only in this temporary local workspace." -ForegroundColor Cyan
    $StackAttempted = $true
    & $SupabaseCli start
    if ($LASTEXITCODE -ne 0) {
      throw "Supabase local stack failed to start or its initial migrations failed (exit $LASTEXITCODE)."
    }

    Write-Host "Replaying the schema baseline and guest-billing migration from scratch..." -ForegroundColor Cyan
    & $SupabaseCli db reset --local --yes
    if ($LASTEXITCODE -ne 0) {
      throw "Local conflict-migration replay failed (exit $LASTEXITCODE). Review the SQL error above."
    }

    Write-Host "PASS: schema snapshot and guest-billing conflict migration applied to the disposable local database." -ForegroundColor Green
  }
  finally {
    Pop-Location
  }
}
catch {
  $Failure = $_
}
finally {
  if ($StackAttempted) {
    Push-Location $TempRoot
    try {
      Write-Host "Stopping the disposable local Supabase stack..." -ForegroundColor DarkCyan
      & $SupabaseCli stop --no-backup
      if ($LASTEXITCODE -ne 0) {
        Write-Warning "The temporary local stack did not fully stop. Its unique project id was $UniqueProjectId."
      }
    }
    catch {
      Write-Warning "Could not stop the temporary local stack cleanly: $($_.Exception.Message)"
    }
    finally {
      Pop-Location
    }
  }
  if (Test-Path $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

if ($Failure) {
  throw $Failure
}
