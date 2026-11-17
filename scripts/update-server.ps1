[CmdletBinding()]
param(
    [switch]$PrepareOnly,
    [ValidatePattern('^[a-zA-Z0-9.-]+$')][string]$ServerAddress = '178.185.223.91',
    [ValidateRange(1, 65535)][int]$ServerPort = 8539,
    [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$ServerUser = 'vasilyeva'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$previousLocation = Get-Location

function Invoke-Checked {
    param([string]$Program, [string[]]$CommandArgs)
    & $Program @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "$Program failed (exit $LASTEXITCODE). Update stopped."
    }
}

try {
    Set-Location -LiteralPath $projectRoot
    $python = Join-Path $projectRoot '.venv\Scripts\python.exe'
    $key = Join-Path $projectRoot '.ssh\id_ed25519'
    if (-not (Test-Path -LiteralPath $python)) { throw "Python environment not found: $python" }
    if (-not $PrepareOnly -and -not (Test-Path -LiteralPath $key)) { throw "SSH key not found: $key" }
    foreach ($command in @('npm.cmd', 'node.exe', 'tar.exe')) { Get-Command $command -ErrorAction Stop | Out-Null }
    if (-not $PrepareOnly) {
        Get-Command ssh.exe -ErrorAction Stop | Out-Null
        Get-Command scp.exe -ErrorAction Stop | Out-Null
    }

    Write-Host '1/4 Installing locked frontend dependencies and building...'
    Invoke-Checked 'npm.cmd' @('ci', '--no-audit', '--no-fund')
    Invoke-Checked 'npm.cmd' @('run', 'build')

    Write-Host '2/4 Running tests on isolated data...'
    Invoke-Checked $python @('scripts/test-deploy-guards.py')
    Invoke-Checked $python @('-m', 'unittest', 'discover', '-s', 'backend/tests', '-v')
    Invoke-Checked 'npm.cmd' @('run', 'test:frontend')
    Invoke-Checked 'npm.cmd' @('run', 'test:ui')

    $releaseId = 'ss-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0, 8))
    $outputDirectory = Join-Path $projectRoot ('.cache\deploy\' + $releaseId)
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $manifest = [ordered]@{
        releaseId = $releaseId
        builtAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        indexSha256 = (Get-FileHash -LiteralPath 'dist\index.html' -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $projectRoot 'dist\deployment-manifest.json'), ($manifest | ConvertTo-Json), $utf8)
    $installer = Join-Path $outputDirectory ('install-' + $releaseId + '.sh')
    $source = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'install-server-update.sh'))
    [IO.File]::WriteAllText($installer, $source.Replace("`r`n", "`n"), $utf8)
    $archive = Join-Path $outputDirectory ($releaseId + '.tar.gz')
    $packagePaths = @('dist', 'src', 'backend/app', 'backend/seed.json', 'backend/requirements.txt', 'public', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'postcss.config.js', 'tailwind.config.js', 'components.json')
    Invoke-Checked 'tar.exe' (@('--exclude=__pycache__', '--exclude=*.pyc', '-czf', $archive) + $packagePaths)
    Invoke-Checked 'tar.exe' @('-tzf', $archive, 'dist/deployment-manifest.json')
    Write-Host "Release: $releaseId"
    Write-Host "Package: $archive"
    if ($PrepareOnly) {
        Write-Host 'PREPARE OK. No files uploaded and no server changes made.'
        return
    }

    Write-Host '3/4 Uploading the new package and its matching installer...'
    $destination = $ServerUser + '@' + $ServerAddress
    Invoke-Checked 'scp.exe' @('-P', [string]$ServerPort, '-i', $key, $archive, $installer, ($destination + ':/tmp/'))
    Write-Host '4/4 Installing, backing up and checking the server...'
    $remoteCommand = 'sudo bash /tmp/' + [IO.Path]::GetFileName($installer) + ' /tmp/' + [IO.Path]::GetFileName($archive)
    Invoke-Checked 'ssh.exe' @('-t', '-p', [string]$ServerPort, '-i', $key, $destination, $remoteCommand)
    Write-Host 'Finished. Open https://trial-test.sechenov.ai and press Ctrl+F5.'
} finally {
    Set-Location -LiteralPath $previousLocation.Path
}
