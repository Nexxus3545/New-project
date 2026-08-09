param(
  [string]$BuildRoot = (Join-Path $env:TEMP 'mwos-mobile-apk-build'),
  [switch]$KeepBuildRoot
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$logDir = Join-Path $projectRoot 'logs'
$transcriptPath = Join-Path $logDir 'android-apk-build.log'
$outputDir = Join-Path $projectRoot 'dist-export'
$outputApk = Join-Path $outputDir 'MWOS-Android.apk'
$nodeModulesTarget = Join-Path $projectRoot 'node_modules'
$javaHomeCandidates = @(
  'C:\Program Files\Android\Android Studio\jbr',
  'C:\Program Files\Android\Android Studio\jre'
)

function Write-Step([string]$message) {
  Write-Host $message -ForegroundColor Cyan
}

function Resolve-JavaHome {
  foreach ($candidate in $javaHomeCandidates) {
    if (Test-Path (Join-Path $candidate 'bin\java.exe')) {
      return $candidate
    }
  }

  throw 'A bundled JDK was not found under Android Studio. Install Android Studio or set JAVA_HOME manually.'
}

function Patch-GradleRepositories([string]$AndroidProjectRoot) {
  $gradleBuildFile = Join-Path $AndroidProjectRoot 'build.gradle'
  if (-not (Test-Path $gradleBuildFile)) {
    return
  }

  $content = [System.IO.File]::ReadAllText($gradleBuildFile)
  if ($content -match 'repo1\.maven\.org/maven2') {
    return
  }

  $replacement = '$1maven { url "https://repo.maven.apache.org/maven2" }' + "`r`n" + '$1mavenCentral()'
  $content = [regex]::Replace($content, '(?m)^(\s*)mavenCentral\(\)\s*$', $replacement)
  $encoding = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($gradleBuildFile, $content, $encoding)
}

function Write-GradleInitScript([string]$InitScriptPath) {
  $initScript = @"
gradle.beforeProject { project ->
  project.buildscript.repositories {
    maven { url 'https://repo.maven.apache.org/maven2' }
  }
  project.repositories {
    maven { url 'https://repo.maven.apache.org/maven2' }
  }
}

settingsEvaluated { settings ->
  settings.pluginManagement.repositories {
    maven { url 'https://repo.maven.apache.org/maven2' }
  }
}
"@
  $encoding = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($InitScriptPath, $initScript, $encoding)
}

function Patch-GradleProperties([string]$AndroidProjectRoot) {
  $gradlePropertiesFile = Join-Path $AndroidProjectRoot 'gradle.properties'
  if (-not (Test-Path $gradlePropertiesFile)) {
    return
  }

  $content = [System.IO.File]::ReadAllText($gradlePropertiesFile)
  if ($content -match 'java\.net\.preferIPv4Stack' -and $content -match 'org\.gradle\.daemon=false') {
    return
  }

  if ($content -match '(?m)^org\.gradle\.jvmargs=(.*)$') {
    $content = [regex]::Replace(
      $content,
      '(?m)^org\.gradle\.jvmargs=(.*)$',
      {
        param($match)
        $jvmArgs = $match.Groups[1].Value.Trim()
        if ($jvmArgs -notmatch 'java\.net\.preferIPv4Stack') {
          $jvmArgs = "$jvmArgs -Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false".Trim()
        }
        return "org.gradle.jvmargs=$jvmArgs"
      }
    )
  } else {
    $content += "`r`norg.gradle.jvmargs=-Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false"
  }

  if ($content -notmatch '(?m)^org\.gradle\.daemon=false$') {
    $content += "`r`norg.gradle.daemon=false"
  }

  if ($content -match '(?m)^reactNativeArchitectures=') {
    $content = [regex]::Replace(
      $content,
      '(?m)^reactNativeArchitectures=.*$',
      'reactNativeArchitectures=arm64-v8a,x86_64'
    )
  } else {
    $content += "`r`nreactNativeArchitectures=arm64-v8a,x86_64"
  }

  if ($content -notmatch '(?m)^systemProp\.org\.gradle\.internal\.http\.connectionTimeout=') {
    $content += "`r`nsystemProp.org.gradle.internal.http.connectionTimeout=600000"
  }

  if ($content -notmatch '(?m)^systemProp\.org\.gradle\.internal\.http\.socketTimeout=') {
    $content += "`r`nsystemProp.org.gradle.internal.http.socketTimeout=600000"
  }

  $encoding = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($gradlePropertiesFile, $content, $encoding)
}

function Remove-TopLevelGradleBlock([string[]]$Lines, [string]$StartPattern) {
  $result = New-Object System.Collections.Generic.List[string]
  $skip = $false
  $depth = 0

  foreach ($line in $Lines) {
    if (-not $skip -and $line -match $StartPattern) {
      $skip = $true
    }

    if ($skip) {
      $depth += ([regex]::Matches($line, '\{')).Count
      $depth -= ([regex]::Matches($line, '\}')).Count

      if ($depth -le 0) {
        $skip = $false
        $depth = 0
      }

      continue
    }

    $result.Add($line)
  }

  return $result.ToArray()
}

function Patch-NativeModuleGradleFiles([string]$NodeModulesRoot) {
  $gradleFiles = @(
    Join-Path $NodeModulesRoot 'react-native-screens\android\build.gradle',
    Join-Path $NodeModulesRoot 'react-native-safe-area-context\android\build.gradle',
    Join-Path $NodeModulesRoot '@react-native-async-storage\async-storage\android\build.gradle'
  )

  foreach ($gradleFile in $gradleFiles) {
    if (-not (Test-Path $gradleFile)) {
      continue
    }

    $content = Get-Content -LiteralPath $gradleFile
    if ($content -match '^\s*buildscript\s*\{') {
      $content = Remove-TopLevelGradleBlock $content '^\s*buildscript\s*\{'
      $encoding = New-Object System.Text.UTF8Encoding $false
      [System.IO.File]::WriteAllLines($gradleFile, $content, $encoding)
      Write-Step "Patched native module Gradle file: $gradleFile"
    }
  }
}

function Copy-MobileSource {
  if (Test-Path $BuildRoot) {
    Remove-Item -Path $BuildRoot -Recurse -Force
  }

  New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null

  $excludeDirs = @(
    'node_modules',
    '.expo',
    'android',
    'ios',
    'dist-export',
    'logs',
    '.git',
    '_tmp'
  )

  $excludeFiles = @('*.log', '*.zip')

  $robocopyArgs = @(
    $projectRoot,
    $BuildRoot,
    '/E',
    '/NFL',
    '/NDL',
    '/NJH',
    '/NJS',
    '/NC',
    '/NS',
    '/XJ'
  )

  foreach ($dir in $excludeDirs) {
    $robocopyArgs += '/XD'
    $robocopyArgs += $dir
  }

  foreach ($file in $excludeFiles) {
    $robocopyArgs += '/XF'
    $robocopyArgs += $file
  }

  & robocopy @robocopyArgs | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "Failed to copy the mobile project into the temporary build root. Robocopy exit code: $LASTEXITCODE"
  }

  $nodeModulesLink = Join-Path $BuildRoot 'node_modules'
  if (Test-Path $nodeModulesLink) {
    Remove-Item -Path $nodeModulesLink -Recurse -Force
  }

  New-Item -ItemType Junction -Path $nodeModulesLink -Target $nodeModulesTarget | Out-Null
}

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Step $label
  & $action
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed with exit code $LASTEXITCODE"
  }
}

$previousJavaHome = $env:JAVA_HOME
$previousAndroidHome = $env:ANDROID_HOME
$previousAndroidSdkRoot = $env:ANDROID_SDK_ROOT
$previousCI = $env:CI
$previousGradleOpts = $env:GRADLE_OPTS
$previousPath = $env:Path
$buildFailed = $false
$transcriptStarted = $false

try {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  try {
    Start-Transcript -Path $transcriptPath -Append | Out-Null
    $transcriptStarted = $true
  } catch {}

  $javaHome = Resolve-JavaHome
  $javaBin = Join-Path $javaHome 'bin'

  $env:JAVA_HOME = $javaHome
  $env:ANDROID_HOME = $sdkRoot
  $env:ANDROID_SDK_ROOT = $sdkRoot
  $env:CI = '1'
  $gradleJvmOpts = '-Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false'
  if ($null -ne $previousGradleOpts -and $previousGradleOpts -ne '') {
    $env:GRADLE_OPTS = "$previousGradleOpts $gradleJvmOpts"
  } else {
    $env:GRADLE_OPTS = $gradleJvmOpts
  }
  $env:Path = "$javaBin;$($sdkRoot)\platform-tools;$($sdkRoot)\emulator;$env:Path"

  Write-Step "Preparing temporary Android build workspace at $BuildRoot..."
  Copy-MobileSource

  Push-Location $BuildRoot
  try {
    Invoke-Step 'Generating the Android project with Expo prebuild...' {
      & npx expo prebuild --platform android --clean --no-install
    }

    Invoke-Step 'Repairing native module Gradle files...' {
      Patch-NativeModuleGradleFiles (Join-Path $BuildRoot 'node_modules')
    }

    $androidProjectRoot = Join-Path $BuildRoot 'android'
    Invoke-Step 'Patching Android repositories for Maven Central access...' {
      Patch-GradleRepositories $androidProjectRoot
    }

    Invoke-Step 'Tuning Gradle JVM settings...' {
      Patch-GradleProperties $androidProjectRoot
    }

    $gradleInitScript = Join-Path $BuildRoot 'gradle-repository-mirror.init.gradle'
    Invoke-Step 'Writing temporary Gradle repository mirror...' {
      Write-GradleInitScript $gradleInitScript
    }

    Push-Location $androidProjectRoot
    try {
      Invoke-Step 'Building the debug APK...' {
        & .\gradlew.bat --no-daemon -I $gradleInitScript assembleDebug
      }
    } finally {
      Pop-Location
    }

    $apkSource = Join-Path $androidProjectRoot 'app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path $apkSource)) {
      $apkSource = Get-ChildItem -Path (Join-Path $androidProjectRoot 'app\build\outputs\apk') -Recurse -Filter '*.apk' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
    }

    if (-not $apkSource -or -not (Test-Path $apkSource)) {
      throw 'The APK output was not found after the Gradle build completed.'
    }

    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    Copy-Item -Path $apkSource -Destination $outputApk -Force

    Write-Host ""
    Write-Host "Android APK ready: $outputApk" -ForegroundColor Green
    Write-Host "This is a debug-signed APK built from the current MWOS mobile app." -ForegroundColor Green
  } finally {
    Pop-Location
  }
}
catch {
  $buildFailed = $true
  Write-Host ""
  Write-Host "APK build failed." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Temporary build root kept at: $BuildRoot" -ForegroundColor Yellow
  throw
}
finally {
  if ($transcriptStarted) {
    try { Stop-Transcript | Out-Null } catch {}
  }

  if (-not $KeepBuildRoot -and -not $buildFailed -and (Test-Path $BuildRoot)) {
    Remove-Item -Path $BuildRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousJavaHome -and $previousJavaHome -ne '') {
    $env:JAVA_HOME = $previousJavaHome
  } else {
    Remove-Item Env:JAVA_HOME -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousAndroidHome -and $previousAndroidHome -ne '') {
    $env:ANDROID_HOME = $previousAndroidHome
  } else {
    Remove-Item Env:ANDROID_HOME -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousAndroidSdkRoot -and $previousAndroidSdkRoot -ne '') {
    $env:ANDROID_SDK_ROOT = $previousAndroidSdkRoot
  } else {
    Remove-Item Env:ANDROID_SDK_ROOT -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousCI -and $previousCI -ne '') {
    $env:CI = $previousCI
  } else {
    Remove-Item Env:CI -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousGradleOpts -and $previousGradleOpts -ne '') {
    $env:GRADLE_OPTS = $previousGradleOpts
  } else {
    Remove-Item Env:GRADLE_OPTS -ErrorAction SilentlyContinue
  }

  $env:Path = $previousPath
}
