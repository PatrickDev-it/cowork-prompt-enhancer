param(
  [switch]$Local,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$Temp = [IO.Path]::GetFullPath((Join-Path $Root 'src/server/.setup'))
if (-not $Temp.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe setup path' }

Push-Location $Root
try {
  bun run install:frozen
  if (-not $Local) {
    Write-Output 'Mock profile installed. Run: bun run preflight; bun run demo:mock'
    return
  }

  $Bin = Join-Path $Root 'src/server/bin'
  $Models = Join-Path $Root 'src/server/models'
  $Executable = Join-Path $Bin 'llama-server.exe'
  $Model = Join-Path $Models 'Qwen3-8B-Q4_K_M.gguf'
  New-Item -ItemType Directory -Force -Path $Temp, $Bin, $Models | Out-Null

  $Artifacts = @(
    @{
      Name = 'llama.zip'
      Url = 'https://github.com/ggml-org/llama.cpp/releases/download/b9893/llama-b9893-bin-win-cuda-12.4-x64.zip'
      Sha256 = '0620f1fa058b73ab59957d809684f192b1f86e6dd0a6b3827ebff2c8c5fe8e7a'
    },
    @{
      Name = 'cuda.zip'
      Url = 'https://github.com/ggml-org/llama.cpp/releases/download/b9893/cudart-llama-bin-win-cuda-12.4-x64.zip'
      Sha256 = '8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'
    }
  )
  if ($Force -or -not (Test-Path -LiteralPath $Executable)) {
    foreach ($Artifact in $Artifacts) {
      $Archive = Join-Path $Temp $Artifact.Name
      Invoke-WebRequest -Uri $Artifact.Url -OutFile $Archive
      $Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Archive).Hash.ToLowerInvariant()
      if ($Actual -ne $Artifact.Sha256) { throw "Checksum mismatch for $($Artifact.Name)" }
      Expand-Archive -LiteralPath $Archive -DestinationPath $Bin -Force
    }
  }

  if ($Force -or -not (Test-Path -LiteralPath $Model)) {
    $ModelUrl = 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/7c41481f57cb95916b40956ab2f0b139b296d974/Qwen3-8B-Q4_K_M.gguf'
    Invoke-WebRequest -Uri $ModelUrl -OutFile $Model
    $Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Model).Hash.ToLowerInvariant()
    if ($Actual -ne 'd98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785') {
      throw 'Checksum mismatch for Qwen3-8B-Q4_K_M.gguf'
    }
  }

  $env:COWORK_PROFILE = 'local'
  bun run preflight
} finally {
  Pop-Location
}
