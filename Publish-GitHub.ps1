# Run from your own PowerShell, after creating an empty zoro62/leaklens repo.
# No token is stored here. Git's normal credential manager handles sign-in.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$repositoryUrl = 'https://github.com/zoro62/leaklens.git'

function Invoke-RepositoryGit {
    & git @args
    if ($LASTEXITCODE -ne 0) {
        throw "Git failed. Check the message above. No force push was attempted."
    }
}

if (-not (Test-Path -LiteralPath '.git')) {
    Invoke-RepositoryGit init -b main
}

$remoteNames = @(& git remote)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Git remotes.' }
if ($remoteNames -contains 'origin') {
    $existingRemote = & git remote get-url origin
    if ($LASTEXITCODE -ne 0) { throw 'Could not read origin.' }
    if ($existingRemote.Trim() -ne $repositoryUrl) {
        throw "Origin already points somewhere else. Check 'git remote -v' before publishing."
    }
} else {
    Invoke-RepositoryGit remote add origin $repositoryUrl
}

Invoke-RepositoryGit add -- .
& git diff --cached --quiet
$stagedStatus = $LASTEXITCODE
if ($stagedStatus -eq 1) {
    # Use the supplied GitHub handle and a no-reply address, rather than exposing
    # a personal email from this computer's global Git configuration.
    Invoke-RepositoryGit -c user.name=zoro62 -c user.email=zoro62@users.noreply.github.com commit -m 'Build LeakLens local screenshot review and permanent redaction'
} elseif ($stagedStatus -ne 0) {
    throw 'Could not inspect staged changes.'
}

Write-Host 'Pushing to zoro62/leaklens. Sign in as zoro62 if Git asks.'
Invoke-RepositoryGit push -u origin HEAD:main
Write-Host 'Published: https://github.com/zoro62/leaklens'
