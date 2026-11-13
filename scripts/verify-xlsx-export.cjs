const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../apps/admin/app/lib/xlsx.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let workbook;
  let clicked = false;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, TextEncoder, Blob,
    URL: {
      createObjectURL(blob) { workbook = blob; return 'blob:verification'; },
      revokeObjectURL() {},
    },
    document: { createElement() { return { click() { clicked = true; } }; } },
  });
  exports.downloadXlsx('kontrol', 'Siparişler', [
    ['Sipariş', 'Adet', 'Tutar', 'İade', 'Not', 'Boş'],
    ['00123', 5, 474.99, -75, '=1+1', null],
    ['Türkçe & <ürün>', 0, 0, 0, 'Normal metin', undefined],
  ]);
  assert.ok(clicked, 'Download must be triggered');
  const bytes = Buffer.from(await workbook.arrayBuffer());
  const files = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, bytes.subarray(start, start + size).toString('utf8'));
    offset = start + size;
  }
  const sheet = files.get('xl/worksheets/sheet1.xml');
  for (const [cell, value] of [['B2', 5], ['C2', 474.99], ['D2', -75], ['B3', 0]]) {
    assert.ok(sheet.includes(`<c r="${cell}"><v>${value}</v></c>`), `${cell} must be numeric`);
  }
  assert.ok(sheet.includes('<t>00123</t>'), 'Leading zeros must survive');
  assert.ok(sheet.includes('<t>=1+1</t>'), 'User text must remain text');
  assert.ok(!sheet.includes('<f>'), 'Text must not become an Excel formula');
  assert.ok(sheet.includes('Türkçe &amp; &lt;ürün&gt;'));
  assert.ok(sheet.includes('<c r="F2" t="inlineStr"><is><t></t></is></c>'));
  console.log('XLSX export passed: numbers, negatives, zero, identifiers, text and empty cells');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
