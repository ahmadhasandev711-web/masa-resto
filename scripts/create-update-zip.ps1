# create-update-zip.ps1
# Generates lightweight and secure resto-update.zip for clients

$ErrorActionPreference = "Stop"

$workspaceRoot = "c:\resto"
$stagingDir = "$workspaceRoot\scratch\update_staging"
$zipOutput = "$workspaceRoot\resto-update.zip"

Write-Host ">>> Preparing update staging directory..."
if (Test-Path "$workspaceRoot\.next\standalone") {
    Get-ChildItem -Path "$workspaceRoot\.next\standalone" -Filter ".env*" -Force | ForEach-Object {
        Write-Host " Removing standalone env leak: $($_.FullName)"
        Remove-Item -Force $_.FullName
    }
}
if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

Write-Host ">>> Copying .next build (excluding standalone and cache)..."
$stagingNext = "$stagingDir\.next"
New-Item -ItemType Directory -Path $stagingNext | Out-Null

Get-ChildItem -Path "$workspaceRoot\.next" | Where-Object { 
    $_.Name -ne "standalone" -and $_.Name -ne "cache" 
} | ForEach-Object {
    Copy-Item -Recurse -Path $_.FullName -Destination $stagingNext
}

Write-Host ">>> Copying public assets..."
Copy-Item -Recurse -Path "$workspaceRoot\public" -Destination "$stagingDir\public"

Write-Host ">>> Copying prisma database migration..."
$stagingPrisma = "$stagingDir\prisma"
New-Item -ItemType Directory -Path $stagingPrisma | Out-Null
Copy-Item -Path "$workspaceRoot\prisma\schema.prisma" -Destination $stagingPrisma
Copy-Item -Path "$workspaceRoot\prisma\migration_soft_delete.sql" -Destination $stagingPrisma

Write-Host ">>> Copying server and configuration files..."
Copy-Item -Path "$workspaceRoot\server.js" -Destination $stagingDir
Copy-Item -Path "$workspaceRoot\package.json" -Destination $stagingDir
Copy-Item -Path "$workspaceRoot\package-lock.json" -Destination $stagingDir
Copy-Item -Path "$workspaceRoot\UPGRADE_GUIDE_AR.txt" -Destination $stagingDir

Write-Host ">>> Scanning for any sensitive files in staging..."
$sensitiveFiles = Get-ChildItem -Path $stagingDir -Recurse -Force | Where-Object {
    $_.Name -like ".env*" -or $_.Name -like "*GEMINI*" -or $_.Name -like "*schema.sql*"
}

if ($sensitiveFiles) {
    Write-Host "Found unwanted files, removing immediately:"
    $sensitiveFiles | ForEach-Object {
        Write-Host " Removing: $($_.FullName)"
        Remove-Item -Force $_.FullName
    }
}

$stagedItems = Get-ChildItem -Path $stagingDir -Name
Write-Host "Staged root items: $($stagedItems -join ', ')"

Write-Host ">>> Creating zip archive: $zipOutput..."
if (Test-Path $zipOutput) {
    Remove-Item -Force $zipOutput
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagingDir, $zipOutput, [System.IO.Compression.CompressionLevel]::Optimal, $false)

$zipItem = Get-Item $zipOutput
$zipSizeMb = [Math]::Round($zipItem.Length / 1MB, 2)
Write-Host ">>> SUCCESS! Created $zipOutput ($zipSizeMb MB)"

# Verification of zip contents
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipOutput)
$foundSensitiveInZip = $zip.Entries | Where-Object { $_.FullName -match '\.env|GEMINI|schema\.sql|standalone' }
if ($foundSensitiveInZip) {
    $zip.Dispose()
    throw "SECURITY FAULT: Found sensitive entries inside zip!"
}
Write-Host ">>> SECURITY VERIFIED: 0 sensitive/leak entries in zip."
$zip.Dispose()

# Cleanup staging directory
Remove-Item -Recurse -Force $stagingDir
Write-Host ">>> Cleaned up staging directory."