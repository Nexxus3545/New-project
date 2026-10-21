param(
  [string]$BuildRoot = (Join-Path $env:TEMP 'mwos-mobile-apk-build'),
  [ValidateSet('debug', 'standalone')][string]$Variant = 'standalone',
  [switch]$KeepBuildRoot
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$logDir = Join-Path $projectRoot 'logs'
$transcriptPath = Join-Path $logDir 'android-apk-build.log'
$outputDir = Join-Path $projectRoot 'dist-export'
$outputApk = Join-Path $outputDir $(if ($Variant -eq 'standalone') { 'MWOS-Android-Preview.apk' } else { 'MWOS-Android-Debug.apk' })
$safeTempParent = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')

function Assert-SafeBuildRoot {
  $resolved = [System.IO.Path]::GetFullPath($BuildRoot).TrimEnd('\')
  if (-not $resolved.StartsWith($safeTempParent + '\', [System.StringComparison]::OrdinalIgnoreCase) -or
      -not ([System.IO.Path]::GetFileName($resolved)).StartsWith('mwos-mobile-')) {
    throw 'The temporary build directory must be an mwos-mobile-* folder under the original TEMP directory.'
  }
  if ((Test-Path -LiteralPath $resolved) -and ((Get-Item -LiteralPath $resolved).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw 'The build directory must not be a symbolic link or junction.'
  }
}

function Remove-BuildRoot {
  Assert-SafeBuildRoot
  $link = Join-Path $BuildRoot 'node_modules'
  if (Test-Path -LiteralPath $link) {
    $item = Get-Item -LiteralPath $link -Force
    if (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
      throw 'Refusing to clean a build directory with an unexpected real node_modules directory.'
    }
    [System.IO.Directory]::Delete($item.FullName)
  }
  Remove-Item -LiteralPath ([System.IO.Path]::GetFullPath($BuildRoot)) -Recurse -Force
}
$nodeModulesTarget = Join-Path $projectRoot 'node_modules'
$javaTempRoot = 'C:\Temp\mwos-java'
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

function Patch-ReactBundleRoot([string]$AndroidProjectRoot) {
  $gradleFile = Join-Path $AndroidProjectRoot 'app\build.gradle'
  $content = [System.IO.File]::ReadAllText($gradleFile)
  $sourcePath = $projectRoot.Replace('\', '/').Replace("'", "\'")
  $rootLine = "def projectRoot = '$sourcePath'"
  if ($content -notmatch '(?m)^def projectRoot = .*') {
    throw 'The generated Android bundle configuration was not recognized.'
  }
  # Bundle in the real source root; Metro cannot reliably follow the temporary node_modules junction.
  $content = [regex]::Replace($content, '(?m)^def projectRoot = .*', { $rootLine })
  $content = $content.Replace('react {', "react {`r`n    root = file(projectRoot)")
  [System.IO.File]::WriteAllText($gradleFile, $content, (New-Object System.Text.UTF8Encoding $false))
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
    (Join-Path -Path $NodeModulesRoot -ChildPath 'react-native-screens\android\build.gradle'),
    (Join-Path -Path $NodeModulesRoot -ChildPath 'react-native-safe-area-context\android\build.gradle'),
    (Join-Path -Path $NodeModulesRoot -ChildPath '@react-native-async-storage\async-storage\android\build.gradle')
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
  Assert-SafeBuildRoot
  if (Test-Path $BuildRoot) {
    Remove-BuildRoot
  }

  New-Item -ItemType Directory -Path $BuildRoot -Force | Out-Null

  $excludeDirs = @(
    'node_modules',
    '.expo',
    'android',
    'ios',
    'dist-export',
    'dist',
    'dist-check',
    'logs',
    '.git',
    '_tmp'
  )

  $excludeFiles = @('*.log', '*.zip', 'NUL')

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
    throw 'The new build workspace unexpectedly already contains node_modules.'
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
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$previousJavaToolOptions = $env:JAVA_TOOL_OPTIONS
$previousApiUrl = $env:EXPO_PUBLIC_API_URL
$previousNodeEnv = $env:NODE_ENV
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
  # JDK selector wakeups need a short, Windows-native temporary socket path.
  New-Item -ItemType Directory -Path $javaTempRoot -Force | Out-Null
  $env:TEMP = $javaTempRoot
  $env:TMP = $javaTempRoot
  $javaSocketOptions = "-Djdk.net.unixdomain.tmpdir=$javaTempRoot -Djava.io.tmpdir=$javaTempRoot"
  if ($null -ne $previousJavaToolOptions -and $previousJavaToolOptions -ne '') {
    $env:JAVA_TOOL_OPTIONS = "$previousJavaToolOptions $javaSocketOptions"
  } else {
    $env:JAVA_TOOL_OPTIONS = $javaSocketOptions
  }
  $env:CI = '1'
  if ($Variant -eq 'standalone') {
    $env:NODE_ENV = 'production'
    $env:EXPO_PUBLIC_API_URL = 'https://tmc-copino-mwos-api.vercel.app/api'
  }
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

    Invoke-Step 'Configuring the bundled app source...' {
      Patch-ReactBundleRoot $androidProjectRoot
    }

    $gradleInitScript = Join-Path $BuildRoot 'gradle-repository-mirror.init.gradle'
    Invoke-Step 'Writing temporary Gradle repository mirror...' {
      Write-GradleInitScript $gradleInitScript
    }

    Push-Location $androidProjectRoot
    try {
      Invoke-Step "Building the $Variant APK..." {
        $task = if ($Variant -eq 'standalone') { 'assembleRelease' } else { 'assembleDebug' }
        & .\gradlew.bat --no-daemon -I $gradleInitScript $task
      }
    } finally {
      Pop-Location
    }

    $apkSource = Join-Path $androidProjectRoot $(if ($Variant -eq 'standalone') { 'app\build\outputs\apk\release\app-release.apk' } else { 'app\build\outputs\apk\debug\app-debug.apk' })
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
    Write-Host "Testing build only. It is not a Play Store release. Standalone includes its own JS bundle." -ForegroundColor Yellow
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
    Remove-BuildRoot
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

  if ($null -ne $previousTemp -and $previousTemp -ne '') {
    $env:TEMP = $previousTemp
  } else {
    Remove-Item Env:TEMP -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousTmp -and $previousTmp -ne '') {
    $env:TMP = $previousTmp
  } else {
    Remove-Item Env:TMP -ErrorAction SilentlyContinue
  }

  if ($null -ne $previousJavaToolOptions -and $previousJavaToolOptions -ne '') {
    $env:JAVA_TOOL_OPTIONS = $previousJavaToolOptions
  } else {
    Remove-Item Env:JAVA_TOOL_OPTIONS -ErrorAction SilentlyContinue
  }

  $env:Path = $previousPath
  if ($null -ne $previousApiUrl) { $env:EXPO_PUBLIC_API_URL = $previousApiUrl } else { Remove-Item Env:EXPO_PUBLIC_API_URL -ErrorAction SilentlyContinue }
  if ($null -ne $previousNodeEnv) { $env:NODE_ENV = $previousNodeEnv } else { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue }
}
