# n8n control helper
# Usage:
#   .\n8n.ps1 test              -> verify connection
#   .\n8n.ps1 list             -> list all workflows (id + name + active)
#   .\n8n.ps1 get <id>         -> dump one workflow as JSON to ./export/<id>.json
#   .\n8n.ps1 export-all       -> dump every workflow to ./export/
#   .\n8n.ps1 create <file>    -> create a new workflow from a JSON file (name/nodes/connections/settings)
#   .\n8n.ps1 update <id> <file> -> overwrite an existing workflow from a JSON file

param(
    [Parameter(Position = 0)] [string]$Command = "test",
    [Parameter(Position = 1)] [string]$Arg,
    [Parameter(Position = 2)] [string]$Arg2
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- load .env ---
$envPath = Join-Path $root ".env"
if (-not (Test-Path $envPath)) { throw ".env not found at $envPath" }
$cfg = @{}
foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^\s*([^=]+?)\s*=\s*(.*)$') { $cfg[$matches[1]] = $matches[2].Trim() }
}
$base = $cfg["N8N_URL"].TrimEnd('/')
$key  = $cfg["N8N_API_KEY"]
if (-not $base -or -not $key) { throw "Fill in N8N_URL and N8N_API_KEY in .env first." }

$headers = @{ "X-N8N-API-KEY" = $key; "Accept" = "application/json" }
$api = "$base/api/v1"

function Get-AllWorkflows {
    $all = @(); $cursor = $null
    do {
        $url = "$api/workflows?limit=100"
        if ($cursor) { $url += "&cursor=$cursor" }
        $resp = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        $all += $resp.data
        $cursor = $resp.nextCursor
    } while ($cursor)
    return $all
}

switch ($Command) {
    "test" {
        Write-Host "Testing $api ..." -ForegroundColor Cyan
        $wf = Get-AllWorkflows
        Write-Host "OK - connected. Found $($wf.Count) workflow(s)." -ForegroundColor Green
    }
    "list" {
        Get-AllWorkflows | ForEach-Object {
            $state = if ($_.active) { "ACTIVE " } else { "inactive" }
            "{0}  {1,-10}  {2}" -f $_.id, $state, $_.name
        }
    }
    "get" {
        if (-not $Arg) { throw "Usage: .\n8n.ps1 get <workflowId>" }
        $out = Join-Path $root "export"; New-Item -ItemType Directory -Force -Path $out | Out-Null
        $wf = Invoke-RestMethod -Uri "$api/workflows/$Arg" -Headers $headers -Method Get
        $file = Join-Path $out "$Arg.json"
        $wf | ConvertTo-Json -Depth 50 | Out-File -Encoding utf8 $file
        Write-Host "Saved $file" -ForegroundColor Green
    }
    "export-all" {
        $out = Join-Path $root "export"; New-Item -ItemType Directory -Force -Path $out | Out-Null
        foreach ($w in Get-AllWorkflows) {
            $full = Invoke-RestMethod -Uri "$api/workflows/$($w.id)" -Headers $headers -Method Get
            $safe = ($w.name -replace '[^\w\-]', '_')
            $file = Join-Path $out "$($w.id)_$safe.json"
            $full | ConvertTo-Json -Depth 50 | Out-File -Encoding utf8 $file
            Write-Host "Saved $file"
        }
        Write-Host "Done." -ForegroundColor Green
    }
    "create" {
        if (-not $Arg) { throw "Usage: .\n8n.ps1 create <path-to-json>" }
        $raw = Get-Content -Raw -Encoding utf8 $Arg
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
        $resp = Invoke-RestMethod -Uri "$api/workflows" -Headers $headers -Method Post -Body $bytes -ContentType 'application/json; charset=utf-8'
        Write-Host "Created workflow  id=$($resp.id)  name=$($resp.name)" -ForegroundColor Green
        Write-Host "Open it: $base/workflow/$($resp.id)"
    }
    "update" {
        if (-not $Arg -or -not $Arg2) { throw "Usage: .\n8n.ps1 update <id> <path-to-json>" }
        $raw = Get-Content -Raw -Encoding utf8 $Arg2
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($raw)
        $resp = Invoke-RestMethod -Uri "$api/workflows/$Arg" -Headers $headers -Method Put -Body $bytes -ContentType 'application/json; charset=utf-8'
        Write-Host "Updated workflow  id=$($resp.id)  name=$($resp.name)" -ForegroundColor Green
        Write-Host "Open it: $base/workflow/$($resp.id)"
    }
    default { throw "Unknown command '$Command'. Use: test | list | get <id> | export-all | create <file> | update <id> <file>" }
}
