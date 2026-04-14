$ErrorActionPreference = 'Continue'
$wd='d:\PTE\kai-kou'
$outDir=Join-Path $wd 'output'
if(!(Test-Path $outDir)){ New-Item -ItemType Directory -Path $outDir | Out-Null }
$apiOut=Join-Path $outDir 'tmp-api3.log'
$apiErr=Join-Path $outDir 'tmp-api3.err.log'
$viteOut=Join-Path $outDir 'tmp-vite3.log'
$viteErr=Join-Path $outDir 'tmp-vite3.err.log'
$api = Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $wd -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru
Start-Sleep -Seconds 2
$viteCmd = Join-Path $wd 'node_modules\.bin\vite.cmd'
$vite = Start-Process -FilePath $viteCmd -ArgumentList '--host','127.0.0.1','--port','5173' -WorkingDirectory $wd -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr -PassThru
Start-Sleep -Seconds 4
try {
  try {
    $r1 = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/api/debug/client-fetch' -Method Get -UseBasicParsing -TimeoutSec 10
    Write-Output "5173 client-fetch => $($r1.StatusCode)"
    Write-Output "5173 client-fetch body => $($r1.Content)"
  } catch {
    if($_.Exception.Response){
      $resp=$_.Exception.Response
      $rd=New-Object System.IO.StreamReader($resp.GetResponseStream())
      Write-Output "5173 client-fetch => HTTP $([int]$resp.StatusCode)"
      Write-Output "5173 client-fetch body => $($rd.ReadToEnd())"
    } else {
      Write-Output "5173 client-fetch => ERROR: $($_.Exception.Message)"
    }
  }

  try {
    $payload='{"probe":true,"request_id":"diag_proxy","source":"manual"}'
    $r2 = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/api/debug/post-probe' -Method Post -ContentType 'application/json' -Body $payload -UseBasicParsing -TimeoutSec 10
    Write-Output "5173 post-probe => $($r2.StatusCode)"
    Write-Output "5173 post-probe body => $($r2.Content)"
  } catch {
    if($_.Exception.Response){
      $resp=$_.Exception.Response
      $rd=New-Object System.IO.StreamReader($resp.GetResponseStream())
      Write-Output "5173 post-probe => HTTP $([int]$resp.StatusCode)"
      Write-Output "5173 post-probe body => $($rd.ReadToEnd())"
    } else {
      Write-Output "5173 post-probe => ERROR: $($_.Exception.Message)"
    }
  }

  try {
    $body='{"taskType":"WE","transcript":"hello test essay body content","questionContent":"test"}'
    $r3 = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/api/score' -Method Post -ContentType 'application/json' -Body $body -UseBasicParsing -TimeoutSec 10
    Write-Output "5173 score => $($r3.StatusCode)"
    Write-Output "5173 score body => $($r3.Content)"
  } catch {
    if($_.Exception.Response){
      $resp=$_.Exception.Response
      $rd=New-Object System.IO.StreamReader($resp.GetResponseStream())
      Write-Output "5173 score => HTTP $([int]$resp.StatusCode)"
      Write-Output "5173 score body => $($rd.ReadToEnd())"
    } else {
      Write-Output "5173 score => ERROR: $($_.Exception.Message)"
    }
  }
}
finally {
  Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
  Write-Output '--- vite stdout ---'
  if(Test-Path $viteOut){ Get-Content $viteOut -Tail 80 }
  Write-Output '--- vite stderr ---'
  if(Test-Path $viteErr){ Get-Content $viteErr -Tail 80 }
  Write-Output '--- api stdout ---'
  if(Test-Path $apiOut){ Get-Content $apiOut -Tail 80 }
  Write-Output '--- api stderr ---'
  if(Test-Path $apiErr){ Get-Content $apiErr -Tail 80 }
}
