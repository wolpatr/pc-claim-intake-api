[CmdletBinding()]
param(
  [int]$Port = 4321,
  [int]$HttpsPort = 8443,
  [switch]$SkipServe
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host $Message -ForegroundColor Red
  exit 1
}

function Test-PortInUse([int]$Port) {
  try {
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    if ($listeners) { return $true }
  } catch {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $client.Connect('127.0.0.1', $Port)
      return $true
    } catch {
      return $false
    } finally {
      $client.Dispose()
    }
  }
  return $false
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$serverPath = Join-Path $repoRoot 'interview-sim\server.mjs'
if (-not (Test-Path $serverPath)) {
  Fail "Cannot find interview-sim\server.mjs under $repoRoot. Run this script from the repository root."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail 'node is not on PATH. Install Node.js 24 first.'
}
if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
  Fail 'tailscale is not on PATH. Install Tailscale on this PC and sign in first.'
}

try {
  $status = (& tailscale status --json | ConvertFrom-Json)
} catch {
  Fail "Could not read 'tailscale status --json': $($_.Exception.Message)"
}
if ($status.BackendState -ne 'Running') {
  Fail "Tailscale backend is not running (BackendState: $($status.BackendState)). Run 'tailscale up' and sign in on both devices first."
}

$dnsName = ([string]$status.Self.DNSName).TrimEnd('.')
if (-not $dnsName) {
  Fail 'Tailscale did not report a DNS name for this node. Enable MagicDNS and HTTPS certificates for the tailnet first.'
}
$ipv4 = @($status.Self.TailscaleIPs) | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1
if (-not $ipv4) { $ipv4 = '(none reported)' }

$target = "http://127.0.0.1:$Port"
$phoneUrl = "https://${dnsName}:$HttpsPort"

if (Test-PortInUse $Port) {
  Fail "Port $Port is already in use. Stop the other process or rerun with -Port <free port>."
}

if (-not $SkipServe) {
  $serveRaw = (& tailscale serve status --json | Out-String).Trim()
  $serve = $null
  if (-not [string]::IsNullOrWhiteSpace($serveRaw)) {
    try {
      $serve = $serveRaw | ConvertFrom-Json
    } catch {
      Fail "Could not read 'tailscale serve status --json': $($_.Exception.Message). Enable Serve HTTPS for the tailnet in the Tailscale admin console, then retry."
    }
  }

  $mappings = @()
  if ($serve.Web) {
    foreach ($site in $serve.Web.PSObject.Properties) {
      $key = [string]$site.Name
      $mappedPort = ($key -split ':')[-1]
      if ($mappedPort -ne [string]$HttpsPort) { continue }
      foreach ($handler in $site.Value.Handlers.PSObject.Properties) {
        $mappings += [pscustomobject]@{
          Key = $key
          Path = [string]$handler.Name
          Proxy = [string]$handler.Value.Proxy
        }
      }
    }
  }

  $tcpClaimed = $false
  if ($serve.TCP) {
    foreach ($tcp in $serve.TCP.PSObject.Properties) {
      if ([string]$tcp.Name -eq [string]$HttpsPort) { $tcpClaimed = $true }
    }
  }

  $conflicts = @($mappings | Where-Object { $_.Proxy.TrimEnd('/').ToLower() -ne $target.ToLower() })
  if ($conflicts.Count -gt 0 -or ($tcpClaimed -and $mappings.Count -eq 0)) {
    $existing = if ($conflicts.Count -gt 0) {
      ($conflicts | ForEach-Object { "$($_.Key)$($_.Path) -> $($_.Proxy)" }) -join '; '
    } else {
      "TCP port $HttpsPort (no web proxy recorded)"
    }
    Fail "Tailscale Serve HTTPS port $HttpsPort is already mapped to something else: $existing. Nothing was changed. Stop the other mapping first, or rerun with -SkipServe and manage Serve yourself."
  }

  if ($mappings.Count -gt 0) {
    Write-Host "Tailscale Serve already maps HTTPS port $HttpsPort to $target. Leaving it unchanged."
  } else {
    & tailscale serve --bg --yes "--https=$HttpsPort" $target
    if ($LASTEXITCODE -ne 0) {
      Fail "tailscale serve failed with exit code $LASTEXITCODE. Enable Serve HTTPS for the tailnet and retry. Nothing else was changed."
    }
    Write-Host "Added Tailscale Serve mapping: HTTPS port $HttpsPort -> $target. Other Serve mappings were left untouched."
  }
  Write-Host "This Serve mapping stays active after this server exits until you remove it. It is reachable only from this tailnet and points at $target; never repoint it at another service."
  Write-Host "Remove it later with: tailscale serve --https=$HttpsPort off"
} else {
  Write-Host "Skipping Tailscale Serve configuration (-SkipServe). Assuming HTTPS port $HttpsPort already proxies to $target."
}

$env:INTERVIEW_SIM_PUBLIC_URL = $phoneUrl
$env:INTERVIEW_SIM_PORT = [string]$Port
$env:INTERVIEW_SIM_HOST = '127.0.0.1'
$env:INTERVIEW_SIM_LAN = ''
$env:INTERVIEW_SIM_HTTPS = ''

Write-Host ''
Write-Host "Phone URL: $phoneUrl"
Write-Host "Tailscale IPv4: $ipv4"
Write-Host 'Access is limited to this tailnet. Never use tailscale funnel or a public tunnel for this server.'
Write-Host 'Keep the PC awake and this window (the server) running while you practice.'
Write-Host 'Press Ctrl+C to stop the server.'

Push-Location $repoRoot
try {
  & node $serverPath
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
