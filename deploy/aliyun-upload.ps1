<#
.SYNOPSIS
  Upload this local project to an ECS host and deploy it with Docker Compose.

.EXAMPLE
  .\deploy\aliyun-upload.ps1 -Server root@47.XX.XX.XX -Email admin@example.com
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$Server,

  [Parameter(Mandatory)]
  [string]$Email,

  [Parameter(Mandatory)]
  [string]$Domain,

  [string]$AdminUser = 'admin',

  [string]$RemoteDirectory = '/opt/xddq-assistant'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

function Assert-CommandAvailable([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command was not found: $Name. Install the Windows OpenSSH Client and try again."
  }
}

function ConvertTo-PlainText([System.Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Invoke-External([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code: $LASTEXITCODE"
  }
}

Assert-CommandAvailable 'ssh.exe'
Assert-CommandAvailable 'scp.exe'
Assert-CommandAvailable 'tar.exe'

$Server = $Server.Replace('\@', '@')
$Email = $Email.Replace('\@', '@')

if ($Server -notmatch '^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+$') {
  throw 'Invalid SSH server. Use a value such as root@203.0.113.10.'
}
if ($Email -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') {
  throw 'Invalid certificate email.'
}
if ($Domain -notmatch '^[A-Za-z0-9.-]+$') {
  throw 'Invalid domain. Do not include https:// or a path.'
}
if ($AdminUser -notmatch '^[A-Za-z0-9_.-]+$') {
  throw 'Admin user may contain only letters, numbers, dots, underscores, and hyphens.'
}

$securePassword = Read-Host 'Set dashboard password (at least 8 characters)' -AsSecureString
$plainPassword = ConvertTo-PlainText $securePassword
if ($plainPassword -notmatch '^[A-Za-z0-9._~!@%^+=-]{8,}$') {
  throw 'Password must have at least 8 characters and may use letters, numbers, and . _ ~ ! @ % ^ + = - only.'
}

$token = [guid]::NewGuid().ToString('N')
$archivePath = Join-Path ([IO.Path]::GetTempPath()) "xddq-assistant-$token.tar.gz"
$environmentPath = Join-Path ([IO.Path]::GetTempPath()) "xddq-assistant-$token.env"
$remoteArchive = "/tmp/xddq-assistant-$token.tar.gz"
$remoteEnvironment = "/tmp/xddq-assistant-$token.env"

try {
  $excludedTopLevelItems = @(
    '.git', '.env', 'account.js', 'data', 'logs', 'node_modules',
    'dist-dashboard', 'work', 'apk-analysis'
  )
  $tarSources = @(
    Get-ChildItem -Force -LiteralPath $projectRoot |
      Where-Object { $_.Name -notin $excludedTopLevelItems } |
      ForEach-Object { $_.Name }
  )
  if (-not $tarSources.Count) {
    throw 'No project files were selected for upload.'
  }
  $tarArguments = @(
    '-czf', $archivePath,
    '--exclude=deploy/caddy-data', '--exclude=deploy/caddy-config',
    '-C', $projectRoot
  ) + $tarSources
  Invoke-External 'tar.exe' $tarArguments

  $archiveEntries = & tar.exe -tzf $archivePath
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to validate the upload archive: $LASTEXITCODE"
  }
  if ($archiveEntries -notcontains 'web/src/features/logs/RunLogsPage.vue') {
    throw 'The upload archive is missing web/src/features/logs/RunLogsPage.vue.'
  }

  $environment = @(
    "DASHBOARD_DOMAIN=$Domain",
    "CADDY_EMAIL=$Email",
    "DASHBOARD_BASIC_AUTH_USER=$AdminUser",
    "DASHBOARD_BASIC_AUTH_PASSWORD=$plainPassword"
  ) -join "`n"
  [IO.File]::WriteAllText($environmentPath, "$environment`n", (New-Object Text.UTF8Encoding($false)))

  Write-Host 'Uploading the project and deployment configuration...'
  Invoke-External 'scp.exe' @($archivePath, "${Server}:$remoteArchive")
  Invoke-External 'scp.exe' @($environmentPath, "${Server}:$remoteEnvironment")

  $remoteScript = @"
set -Eeuo pipefail
if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is not installed on the server.' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Compose v2 is required on the server.' >&2
  exit 1
fi
mkdir -p '$RemoteDirectory'
tar -xzf '$remoteArchive' -C '$RemoteDirectory'
install -m 600 '$remoteEnvironment' '$RemoteDirectory/.env'
mkdir -p '$RemoteDirectory/data' '$RemoteDirectory/logs' '$RemoteDirectory/deploy/caddy-data' '$RemoteDirectory/deploy/caddy-config'
cd '$RemoteDirectory'
if command -v nginx >/dev/null 2>&1 && [[ -d /www/server/panel/vhost/nginx ]]; then
  docker compose -f docker-compose.yml -f deploy/docker-compose.host-nginx.yml rm -sf caddy >/dev/null 2>&1 || true
  docker compose -f docker-compose.yml -f deploy/docker-compose.host-nginx.yml up -d --build --remove-orphans
  bash '$RemoteDirectory/deploy/aliyun-host-nginx.sh' '$Domain' '$Email'
  docker compose -f docker-compose.yml -f deploy/docker-compose.host-nginx.yml ps
else
  docker compose up -d --build --remove-orphans
  docker compose ps
fi
rm -f '$remoteArchive' '$remoteEnvironment'
"@

  Write-Host 'Building the Docker app and configuring host Nginx...'
  $remoteScript | & ssh.exe $Server 'bash -s'
  if ($LASTEXITCODE -ne 0) {
    throw "Server deployment failed with exit code: $LASTEXITCODE"
  }

  Write-Host "Deployment complete. Open: https://$Domain"
} finally {
  $plainPassword = ''
  Remove-Item -LiteralPath $archivePath, $environmentPath -Force -ErrorAction SilentlyContinue
}
