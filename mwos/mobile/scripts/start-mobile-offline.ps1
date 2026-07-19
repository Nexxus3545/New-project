param(
  [int[]]$CandidatePorts = @(8082, 8083, 8084, 8081)
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot 'logs'
$transcriptPath = Join-Path $logDir 'mobile-start.log'

function Write-Step([string]$message) {
  Write-Host $message -ForegroundColor Cyan
}

function Clear-ProxyEnvironment {
  foreach ($name in 'ALL_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'GIT_HTTP_PROXY', 'GIT_HTTPS_PROXY') {
    if (Test-Path "Env:$name") {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
  }
}

function Get-AvailableMetroPort([int[]]$ports) {
  $netstat = & netstat -ano 2>$null
  foreach ($candidate in ($ports | Select-Object -Unique)) {
    $pattern = ":$candidate\s+.*LISTENING"
    $isListening = $false
    foreach ($line in $netstat) {
      if ($line -match $pattern) {
        $isListening = $true
        break
      }
    }

    if (-not $isListening) {
      return $candidate
    }
  }

  throw "No free Metro port was found in the candidate set: $($ports -join ', ')"
}

function Stop-StaleExpoProcesses([int[]]$ports) {
  $netstat = & netstat -ano 2>$null
  $candidatePids = @()

  foreach ($port in ($ports | Select-Object -Unique)) {
    foreach ($line in $netstat) {
      if ($line -match ":$port\s+.*LISTENING\s+(\d+)$") {
        $candidatePids += [int]$Matches[1]
      }
    }
  }

  foreach ($pid in ($candidatePids | Select-Object -Unique)) {
    try {
      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$pid"
      $commandLine = $process.CommandLine
      if ($commandLine -match '(?i)expo\\bin\\cli|expo start|metro|mwos[\\/]+mobile') {
        Write-Step "Stopping stale Expo process on a mobile port: PID $pid"
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
}

Clear-ProxyEnvironment
$null = New-Item -ItemType Directory -Path $logDir -Force
$transcriptStarted = $false
try {
  Start-Transcript -Path $transcriptPath -Append | Out-Null
  $transcriptStarted = $true
} catch {}

$candidatePorts = $CandidatePorts | Select-Object -Unique
Stop-StaleExpoProcesses -ports $candidatePorts
$metroPort = Get-AvailableMetroPort -ports $CandidatePorts
$previousCi = $env:CI
$env:CI = '1'

Write-Step "Starting MWOS mobile Metro on port $metroPort..."
Push-Location $projectRoot
try {
  & npx expo start --port $metroPort --offline
} finally {
  Pop-Location
  if ($transcriptStarted) {
    try { Stop-Transcript | Out-Null } catch {}
  }
  if ($null -ne $previousCi -and $previousCi -ne '') {
    $env:CI = $previousCi
  } else {
    Remove-Item Env:CI -ErrorAction SilentlyContinue
  }
}
