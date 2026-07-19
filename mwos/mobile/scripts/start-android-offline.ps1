param(
  [switch]$RepairOnly,
  [switch]$ColdBoot,
  [switch]$Offline,
  [string]$AvdName,
  [int]$Port
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$adbPath = Join-Path $sdkRoot 'platform-tools\adb.exe'
$emulatorPath = Join-Path $sdkRoot 'emulator\emulator.exe'
$candidateMetroPorts = @($Port, 8081, 8082, 8083, 8084) | Where-Object { $_ -gt 0 } | Select-Object -Unique

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

function Invoke-AdbIgnoringNoDevice([string[]]$arguments) {
  $stdoutPath = [System.IO.Path]::GetTempFileName()
  $stderrPath = [System.IO.Path]::GetTempFileName()
  try {
    $process = Start-Process `
      -FilePath $adbPath `
      -ArgumentList $arguments `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    $output = @(
      Get-Content $stdoutPath -ErrorAction SilentlyContinue
      Get-Content $stderrPath -ErrorAction SilentlyContinue
    )
    $exitCode = $process.ExitCode
  } finally {
    Remove-Item $stdoutPath, $stderrPath -ErrorAction SilentlyContinue
  }

  if ($exitCode -eq 0) {
    return
  }

  $message = ($output | Out-String).Trim()
  if ($message -match 'no devices/emulators found') {
    return
  }

  throw "adb $($arguments -join ' ') failed: $message"
}

function Get-AvailableMetroPort([int[]]$ports) {
  foreach ($candidate in $ports) {
    $listener = Get-NetTCPConnection -LocalPort $candidate -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) {
      return $candidate
    }
  }

  throw "No free Metro port was found in the candidate set: $($ports -join ', ')"
}

function Reset-AdbServer {
  & $adbPath kill-server | Out-Null
  Start-Sleep -Seconds 1
  & $adbPath start-server | Out-Null
}

function Get-AdbEmulatorEntries {
  $lines = & $adbPath devices 2>$null
  if (-not $lines) {
    return @()
  }

  $entries = @()
  foreach ($line in ($lines | Select-Object -Skip 1)) {
    $trimmed = $line.Trim()
    if (-not $trimmed) {
      continue
    }

    $parts = $trimmed -split '\s+'
    if ($parts.Count -lt 2) {
      continue
    }

    if ($parts[0] -notmatch '^emulator-\d+$') {
      continue
    }

    $entries += [PSCustomObject]@{
      Serial = $parts[0]
      State  = $parts[1]
    }
  }

  return $entries
}

function Get-InstalledAvdNames {
  $raw = & $emulatorPath -list-avds 2>$null
  if (-not $raw) {
    return @()
  }

  return ($raw | Where-Object { $_ -and $_.Trim().Length -gt 0 })
}

function Resolve-AvdName([string]$preferredAvd) {
  $available = Get-InstalledAvdNames
  if (-not $available -or $available.Count -eq 0) {
    throw 'No Android Virtual Devices were found. Please create one in Android Studio Device Manager.'
  }

  if ($preferredAvd -and ($available -contains $preferredAvd)) {
    return $preferredAvd
  }

  if ($env:MWOS_ANDROID_AVD -and ($available -contains $env:MWOS_ANDROID_AVD)) {
    return $env:MWOS_ANDROID_AVD
  }

  foreach ($candidate in @('Pixel_9a', 'Pixel_8a', 'Pixel_7a')) {
    if ($available -contains $candidate) {
      return $candidate
    }
  }

  if ($available.Count -eq 1) {
    return $available[0]
  }

  return $available[0]
}

function Get-AttachedEmulatorSerial {
  $readyDevice = Get-AdbEmulatorEntries | Where-Object { $_.State -eq 'device' } | Select-Object -First 1
  if (-not $readyDevice) {
    return $null
  }

  return $readyDevice.Serial
}

function Repair-StaleEmulatorBridge {
  $problemEntries = Get-AdbEmulatorEntries | Where-Object { $_.State -in @('authorizing', 'offline', 'unauthorized') }
  if (-not $problemEntries) {
    return $false
  }

  $states = ($problemEntries | ForEach-Object { "$($_.Serial) [$($_.State)]" }) -join ', '
  Write-Step "Detected stale emulator bridge state: $states"
  Stop-StaleEmulators
  Start-Sleep -Seconds 2
  Reset-AdbServer
  return $true
}

function Stop-StaleEmulators {
  $processes = Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -eq 'emulator' -or $_.ProcessName -like 'qemu-system*'
  }

  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {}
  }
}

function Start-AndroidEmulator([string]$targetAvd, [switch]$UseColdBoot) {
  $args = @('-avd', $targetAvd, '-netdelay', 'none', '-netspeed', 'full')
  if ($UseColdBoot) {
    $args += '-no-snapshot-load'
  }

  Start-Process -FilePath $emulatorPath -ArgumentList $args | Out-Null
}

function Queue-ExpoGoLaunch([string]$serial, [int]$metroPort) {
  if (-not $serial) {
    return
  }

  $expoUrl = "exp://127.0.0.1:$metroPort"
  $launchCommand = "Start-Sleep -Seconds 12; & '$adbPath' -s $serial shell am start -a android.intent.action.VIEW -d '$expoUrl' | Out-Null"
  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $launchCommand) `
    -WindowStyle Hidden | Out-Null
}

function Wait-ForEmulatorAttach([int]$timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  $lastReportedState = $null
  do {
    Start-Sleep -Seconds 3
    $serial = Get-AttachedEmulatorSerial
    if ($serial) {
      return $serial
    }

    $pending = Get-AdbEmulatorEntries | Select-Object -First 1
    if ($pending) {
      $description = "$($pending.Serial) [$($pending.State)]"
      if ($description -ne $lastReportedState) {
        Write-Step "Emulator detected but not ready yet: $description"
        $lastReportedState = $description
      }
    }
  } while ((Get-Date) -lt $deadline)

  return $null
}

function Wait-ForBootComplete([string]$serial, [int]$timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    Start-Sleep -Seconds 4
    try {
      $bootState = (& $adbPath -s $serial shell getprop sys.boot_completed 2>$null | Out-String).Trim()
      if ($bootState -eq '1') {
        return $true
      }
    } catch {}
  } while ((Get-Date) -lt $deadline)

  return $false
}

if (-not (Test-Path $adbPath)) {
  throw "adb.exe was not found at $adbPath"
}

if (-not (Test-Path $emulatorPath)) {
  throw "emulator.exe was not found at $emulatorPath"
}

$resolvedAvdName = Resolve-AvdName -preferredAvd $AvdName
$metroPort = Get-AvailableMetroPort -ports $candidateMetroPorts

Write-Step "Preparing MWOS mobile Android launch for $resolvedAvdName..."
Write-Step "Using Metro port $metroPort."
Clear-ProxyEnvironment
Push-Location $projectRoot
$previousExpoOffline = $env:EXPO_OFFLINE
if ($Offline) {
  $env:EXPO_OFFLINE = '1'
}

try {
  Write-Step 'Resetting adb and preparing the Android bridge...'
  Reset-AdbServer
  Repair-StaleEmulatorBridge | Out-Null
  Invoke-AdbIgnoringNoDevice -arguments @('reverse', '--remove-all')

  $serial = Get-AttachedEmulatorSerial

  if (-not $serial) {
    Write-Step "Launching emulator $resolvedAvdName..."
    Stop-StaleEmulators
    Start-AndroidEmulator -targetAvd $resolvedAvdName -UseColdBoot:$ColdBoot
    $serial = Wait-ForEmulatorAttach -timeoutSeconds 180
  }

  if (-not $serial) {
    Write-Step 'Initial attach failed. Retrying with a cold boot...'
    Stop-StaleEmulators
    Start-Sleep -Seconds 2
    Reset-AdbServer
    Start-AndroidEmulator -targetAvd $resolvedAvdName -UseColdBoot
    $serial = Wait-ForEmulatorAttach -timeoutSeconds 180
  }

  if (-not $serial) {
    throw "The emulator '$resolvedAvdName' did not attach to adb within 3 minutes."
  }

  Write-Step "Waiting for $serial to finish booting..."
  $booted = Wait-ForBootComplete -serial $serial -timeoutSeconds 180
  if (-not $booted) {
    throw "The emulator attached as $serial but never finished booting."
  }

  Invoke-AdbIgnoringNoDevice -arguments @('-s', $serial, 'reverse', "tcp:$metroPort", "tcp:$metroPort")
  Write-Host "Emulator ready on $serial using AVD $resolvedAvdName." -ForegroundColor Green

  if ($RepairOnly) {
    Write-Host 'Repair-only run complete. You can now run npm run android.' -ForegroundColor Green
    return
  }

  Write-Step 'Starting Expo Android session...'
  Queue-ExpoGoLaunch -serial $serial -metroPort $metroPort

  $expoArgs = @('expo', 'start', '--port', $metroPort, '--host', 'localhost', '--non-interactive')
  if ($Offline) {
    $expoArgs += '--offline'
  }

  & npx @expoArgs
} finally {
  Pop-Location
  if ($null -ne $previousExpoOffline -and $previousExpoOffline -ne '') {
    $env:EXPO_OFFLINE = $previousExpoOffline
  } else {
    Remove-Item Env:EXPO_OFFLINE -ErrorAction SilentlyContinue
  }
}
