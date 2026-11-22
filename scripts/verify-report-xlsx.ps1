$ErrorActionPreference = 'Stop'
$fixtureDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'tmp/report-xlsx-20261122'
$manifest = Get-Content -LiteralPath (Join-Path $fixtureDirectory 'manifest.json') -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.IO.Compression.FileSystem
foreach ($fixture in $manifest) {
  $archive = [System.IO.Compression.ZipFile]::OpenRead((Join-Path $fixtureDirectory $fixture.file))
  try {
    $documents = @{}
    foreach ($entry in $archive.Entries) {
      if ($entry.FullName.EndsWith('.xml') -or $entry.FullName.EndsWith('.rels')) {
        $stream = $entry.Open()
        $reader = $null
        try {
          $settings = [System.Xml.XmlReaderSettings]::new()
          $settings.CheckCharacters = $true
          $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
          $reader = [System.Xml.XmlReader]::Create($stream, $settings)
          $document = [System.Xml.XmlDocument]::new()
          $document.PreserveWhitespace = $true
          $document.Load($reader)
          $documents[$entry.FullName] = $document
        } finally {
          if ($null -ne $reader) { $reader.Dispose() }
          $stream.Dispose()
        }
      }
    }
    $workbook = $documents['xl/workbook.xml']
    $sheetName = $workbook.SelectSingleNode('//*[local-name()="sheet"]').GetAttribute('name')
    if ($sheetName -ne $fixture.expectedName -or $sheetName.Length -gt 31 -or $sheetName -match '[\[\]:*?/\\]' -or $sheetName.StartsWith("'") -or $sheetName.EndsWith("'")) { throw "Invalid worksheet name in $($fixture.file)" }
    $sheet = $documents['xl/worksheets/sheet1.xml']
    $formulaCell = $sheet.SelectSingleNode('//*[local-name()="c" and @r="A1"]')
    if ($formulaCell.GetAttribute('t') -ne 'inlineStr' -or $formulaCell.InnerText -ne '=SUM(1,1)' -or $sheet.SelectNodes('//*[local-name()="f"]').Count -ne 0) { throw 'Formula-like content was not preserved as literal text' }
    $whitespace = $sheet.SelectSingleNode('//*[local-name()="c" and @r="B1"]//*[local-name()="t"]')
    if ($whitespace.InnerText -cne "  Başlangıç`nİkinci`tSatır  " -or $whitespace.GetAttribute('space','http://www.w3.org/XML/1998/namespace') -ne 'preserve') { throw 'Whitespace did not survive XML parsing' }
    if ($sheet.SelectSingleNode('//*[local-name()="c" and @r="G1"]').InnerText -ne 'ABCD') { throw 'Illegal XML characters were not removed' }
    if ($sheet.SelectSingleNode('//*[local-name()="c" and @r="H1"]').InnerText -ne '🌿') { throw 'Unicode content was damaged' }
  } finally { $archive.Dispose() }
}
Write-Output 'Strict XLSX checks passed: all ZIP XML parts parsed independently; worksheet names, literal text, whitespace, XML characters and Unicode survived round-trip.'
