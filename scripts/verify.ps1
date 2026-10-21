param(
    [switch]$SkipDatabase
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    Write-Host "`n[$Label]"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$python = Join-Path $projectRoot "backend\venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "Python environment not found at backend\venv. Complete README setup first."
}

Invoke-Checked "Python compilation" {
    & $python -m compileall -q backend
}

if ($SkipDatabase) {
    Remove-Item Env:AQUAFLEET_RUN_DB_TESTS -ErrorAction SilentlyContinue
} else {
    $env:AQUAFLEET_RUN_DB_TESTS = "1"
}

Invoke-Checked "Backend and database tests" {
    & $python -m unittest discover -s backend\tests -p "test_*.py" -v
}

$javascriptFiles = & rg --files frontend -g "*.js"
foreach ($file in $javascriptFiles) {
    Invoke-Checked "JavaScript syntax: $file" {
        node --check $file
    }
}

$frontendTests = Get-ChildItem frontend\tests -Filter "*.test.js" |
    Sort-Object Name
foreach ($test in $frontendTests) {
    Invoke-Checked "Frontend test: $($test.Name)" {
        node $test.FullName
    }
}

Invoke-Checked "Git diff hygiene" {
    git diff --check
}

Write-Host "`nAquaFleet verification completed successfully."
