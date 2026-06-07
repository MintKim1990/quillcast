# package.ps1 — 크롬 웹스토어 업로드용 zip 생성
# 익스텐션 파일만 담는다. 서버(api/)·scratch(비밀키!)·문서·node_modules는 제외.
# 실행: powershell -ExecutionPolicy Bypass -File package.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# manifest에서 버전 읽기 (zip 이름용)
$manifest = Get-Content (Join-Path $root "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version

# 익스텐션에 들어갈 파일/폴더 (존재하는 것만)
$include = @(
  "manifest.json",
  "content.js",
  "inject.js",
  "background.js",
  "panel.css",
  "icons"   # 16/48/128 png 폴더 (있으면 포함)
)

$paths = @()
foreach ($item in $include) {
  $p = Join-Path $root $item
  if (Test-Path $p) { $paths += $p }
  else { Write-Warning "없음(건너뜀): $item" }
}

# icons 폴더가 없으면 경고 (웹스토어는 128px 아이콘 필요)
if (-not (Test-Path (Join-Path $root "icons"))) {
  Write-Warning "icons/ 폴더가 없습니다. 웹스토어 제출 전 16/48/128 px 아이콘이 필요합니다."
}

$out = Join-Path $root "quillcast-v$version.zip"
if (Test-Path $out) { Remove-Item $out -Force }

Compress-Archive -Path $paths -DestinationPath $out -Force
Write-Output "✓ 생성: quillcast-v$version.zip"
Write-Output "  포함: $([System.IO.Path]::GetFileName($out)) <- $($paths.Count)개 항목"
Write-Output "  이 zip을 크롬 웹스토어 개발자 대시보드에 업로드하세요."
