param(
  [switch]$Commit,
  [switch]$Push,
  [switch]$Deploy,
  [string]$Message,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]*$')]
  [string]$Remote = 'origin',
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]*$')]
  [string]$Branch = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

function Invoke-Git {
  # Keep native switches such as -A from binding to a PowerShell parameter.
  $Arguments = $args
  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
}

function Invoke-Node {
  $Arguments = $args
  & node @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Node command failed: node $($Arguments -join ' ')"
  }
}

function Read-CommitMessage {
  if ($script:messageProvided) {
    $text = $Message
  } else {
    Add-Type -AssemblyName Microsoft.VisualBasic
    $text = [Microsoft.VisualBasic.Interaction]::InputBox(
      'Skriv commit-beskeden her. Alle lokale aendringer i website kommer med:',
      'Lys & Logik commit',
      ''
    )
  }
  if ([string]::IsNullOrWhiteSpace($text)) {
    throw 'Commit cancelled: commit message was empty.'
  }
  return $text.Trim()
}

function Assert-SafeStagedFiles {
  $forbidden = @(Invoke-Git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR |
    Where-Object {
      (($_ -match '(^|/)\.env(\.|$)') -and
        ($_ -notmatch '(^|/)\.env\.(local\.)?example$')) -or
      $_ -match '(^|/)supabase/\.temp/' -or
      $_ -match '(^|/)(\.wrangler|\.npm-cache)/'
    })
  if ($forbidden.Count -gt 0) {
    throw "Refusing to commit local-only files:`n$($forbidden -join "`n")"
  }
}

function Assert-PushBranch {
  $current = (Invoke-Git branch --show-current | Out-String).Trim()
  if ($current -ne $Branch) {
    throw "Refusing to push: current branch '$current' must be '$Branch'."
  }
  if ($Deploy -and $Branch -ne 'main') {
    throw 'Production deployment is only allowed from main.'
  }
}

$messageProvided = $PSBoundParameters.ContainsKey('Message')
$modeCount = [int]$Commit.IsPresent + [int]$Push.IsPresent + [int]$Deploy.IsPresent
if ($modeCount -ne 1) {
  throw 'Choose exactly one mode: -Commit, -Push, or -Deploy.'
}
$actualRoot = (Invoke-Git rev-parse --show-toplevel | Out-String).Trim()
if ([IO.Path]::GetFullPath($actualRoot) -ne [IO.Path]::GetFullPath($repoRoot)) {
  throw 'Run ship only from the website repository.'
}
$willPush = $Push -or $Deploy
if ($willPush) {
  Assert-PushBranch
  # Check that the configured destination exists before creating a commit.
  $null = Invoke-Git remote get-url --push $Remote
  $null = Get-Command node -ErrorAction Stop
}
Assert-SafeStagedFiles
Invoke-Git diff --check
Invoke-Git diff --cached --check

Write-Host 'All website changes will be included, including changes already staged.'
Invoke-Git status --short --branch
$hasChanges = -not [string]::IsNullOrWhiteSpace((Invoke-Git status --porcelain | Out-String))
$commitMessage = $null
if ($hasChanges) {
  # Cancel before touching the index or building anything.
  $commitMessage = Read-CommitMessage
}

if ($willPush) {
  Write-Host 'Running unit and integration tests before commit/push...'
  Invoke-Node --test 'tests/*.test.ts'
}
if ($Deploy) {
  Write-Host 'Building production website before commit...'
  # dist/index.html is tracked in this repository; include its refreshed build.
  $previousActions = $env:GITHUB_ACTIONS
  try {
    Remove-Item Env:GITHUB_ACTIONS -ErrorAction SilentlyContinue
    Invoke-Node scripts/build-website.mjs
  } finally {
    if ($null -ne $previousActions) { $env:GITHUB_ACTIONS = $previousActions }
  }
}

$hasChanges = -not [string]::IsNullOrWhiteSpace((Invoke-Git status --porcelain | Out-String))
if ($hasChanges) {
  if ($null -eq $commitMessage) { $commitMessage = Read-CommitMessage }
  Invoke-Git add -A
  Assert-SafeStagedFiles
  Invoke-Git diff --cached --check
  Invoke-Git diff --cached --stat
  # Preserve literal quotes and Danish characters with Windows PowerShell 5.
  $messageFile = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($messageFile, $commitMessage, [Text.UTF8Encoding]::new($false))
    Invoke-Git commit --file $messageFile
  } finally {
    Remove-Item -LiteralPath $messageFile -ErrorAction SilentlyContinue
  }
} else {
  Write-Host 'No local changes to commit.'
}

if ($willPush) {
  Assert-PushBranch
  if (-not [string]::IsNullOrWhiteSpace((Invoke-Git status --porcelain | Out-String))) {
    throw 'Working tree changed during checks/commit. Review it before pushing.'
  }
  $releaseSha = (Invoke-Git rev-parse HEAD | Out-String).Trim()
  Invoke-Git push $Remote "HEAD:refs/heads/$Branch"
  # A pre-push hook or concurrent edit must not change what is deployed.
  if ((Invoke-Git rev-parse HEAD | Out-String).Trim() -ne $releaseSha -or
      -not [string]::IsNullOrWhiteSpace((Invoke-Git status --porcelain | Out-String))) {
    throw 'Repository changed during push. Deployment stopped; review local changes.'
  }
}
if ($Deploy) {
  Write-Host 'Deploying the official website to Cloudflare and verifying published assets...'
  # Same entry point as npm run website:deploy. It propagates build, Wrangler,
  # and production verification failures. No HTTP-200-only fallback.
  Invoke-Node scripts/deploy-website.mjs
  Write-Host 'Production website deployment and verification succeeded.'
}

Write-Host "Done. HEAD: $((Invoke-Git rev-parse --short HEAD | Out-String).Trim())"
Invoke-Git status --short --branch
