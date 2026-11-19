try {
    $ErrorActionPreference = "Stop"
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $projectFile = Join-Path $projectRoot "desktop\TeamModeControl\TeamModeControl.csproj"
    $exe = Join-Path $projectRoot "desktop\TeamModeControl\bin\Release\net10.0-windows\SolTeamModeControl.exe"
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22+ is required and must be available on PATH." }
    $nodeVersion = (& node --version).TrimStart('v')
    if ([version]$nodeVersion -lt [version]'22.0') { throw "Node.js 22+ is required." }
    $needsBuild = -not (Test-Path -LiteralPath $exe)
    if (-not $needsBuild) {
        $exeTime = (Get-Item -LiteralPath $exe).LastWriteTimeUtc
        $sourceRoots = @(
            (Join-Path $projectRoot "desktop\TeamModeControl"),
            (Join-Path $projectRoot "templates\codex"),
            (Join-Path $projectRoot "src")
        )
        $sourceFiles = foreach ($sourceRoot in $sourceRoots) {
            if (Test-Path -LiteralPath $sourceRoot) {
                Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Where-Object {
                    $_.FullName -notmatch "\\(bin|obj)\\"
                }
            }
        }
        $needsBuild = @($sourceFiles | Where-Object { $_.LastWriteTimeUtc -gt $exeTime }).Count -gt 0
    }
    if ($needsBuild) {
        if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw ".NET 10 SDK is required to build the control panel." }
        & dotnet build $projectFile --configuration Release --nologo
        if ($LASTEXITCODE -ne 0) { throw "The control panel did not build successfully." }
    }
    $start = [System.Diagnostics.ProcessStartInfo]::new($exe)
    $start.WorkingDirectory = $projectRoot
    $start.UseShellExecute = $false
    $process = [System.Diagnostics.Process]::Start($start)
    if ($null -eq $process) { throw "Could not start the team-mode control panel." }
}
catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Sol + DSH + Codex", "OK", "Error") | Out-Null
    exit 1
}
