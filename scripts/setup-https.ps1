param([string]$LanAddress = '192.168.1.136')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Force .certs | Out-Null
$mkcertCommand = Get-Command mkcert -ErrorAction SilentlyContinue
if ($mkcertCommand) {
  $mkcertPath = $mkcertCommand.Source
} else {
  $mkcertPath = Join-Path (Get-Location) '.certs/mkcert.exe'
  if (!(Test-Path -LiteralPath $mkcertPath)) {
    Invoke-WebRequest 'https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe' -OutFile $mkcertPath
  }
}
$previousTrustStores = $env:TRUST_STORES
try {
  $env:TRUST_STORES = 'system'
  & $mkcertPath -install
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel instalar a CA local.' }
} finally {
  $env:TRUST_STORES = $previousTrustStores
}
& $mkcertPath -cert-file .certs/local.pem -key-file .certs/local-key.pem localhost 127.0.0.1 ::1 $LanAddress
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel gerar o certificado.' }
$caDirectory = & $mkcertPath -CAROOT
# Only the public CA certificate is copied; private keys stay outside public/ and dist/.
Copy-Item -LiteralPath (Join-Path $caDirectory 'rootCA.pem') -Destination .certs/My-Music-CA.crt
Write-Host "HTTPS pronto: https://${LanAddress}:5173"
Write-Host 'Transfere apenas .certs/My-Music-CA.crt para o iPhone e ativa a confianca SSL nas Definicoes.'
