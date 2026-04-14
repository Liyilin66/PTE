$ErrorActionPreference = 'Continue'
$wd='d:\PTE\kai-kou'
$outDir=Join-Path $wd 'output'
if(!(Test-Path $outDir)){ New-Item -ItemType Directory -Path $outDir | Out-Null }
$apiOut=Join-Path $outDir 'tmp-api.log'
$apiErr=Join-Path $outDir 'tmp-api.err.log'
$api = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $wd -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
Start-Sleep -Seconds 2
try {
  try {
    $r1 = Invoke-WebRequest -Uri 'http://localhost:3001/api/debug/client-fetch' -Method Get -UseBasicParsing -TimeoutSec 10
    Write-Output "3001 client-fetch => $($r1.StatusCode)"
    Write-Output "3001 client-fetch body => $($r1.Content)"
  } catch {
    if($_.Exception.Response){
      $resp=$_.Exception.Response
      $rd=New-Object System.IO.StreamReader($resp.GetResponseStream())
      Write-Output "3001 client-fetch => HTTP $([int]$resp.StatusCode)"
      Write-Output "3001 client-fetch body => $($rd.ReadToEnd())"
    } else {
      Write-Output "3001 client-fetch => ERROR: $($_.Exception.Message)"
    }
  }

  try {
    $payload='{"probe":true,"request_id":"diag_manual","source":"manual"}'
    $r2 = Invoke-WebRequest -Uri 'http://localhost:3001/api/debug/post-probe' -Method Post -ContentType 'application/json' -Body $payload -UseBasicParsing -TimeoutSec 10
    Write-Output "3001 post-probe => $($r2.StatusCode)"
    Write-Output "3001 post-probe body => $($r2.Content)"
  } catch {
    if($_.Exception.Response){
      $resp=$_.Exception.Response
      $rd=New-Object System.IO.StreamReader($resp.GetResponseStream())
      Write-Output "3001 post-probe => HTTP $([int]$resp.StatusCode)"
      Write-Output "3001 post-probe body => $($rd.ReadToEnd())"
    } else {
      Write-Output "3001 post-probe => ERROR: $($_.Exception.Message)"
    }
  }
}
finally {
  Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Write-Output '--- api stdout ---'
  if(Test-Path $apiOut){ Get-Content $apiOut -Tail 80 }
  Write-Output '--- api stderr ---'
  if(Test-Path $apiErr){ Get-Content $apiErr -Tail 80 }
}
