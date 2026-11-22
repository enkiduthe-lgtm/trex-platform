// Generate real downloads in memory, independently read ZIP entries and validate fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),{unzipSync,strFromU8}=require(path.join(root,'node_modules/fflate'));
const directory=path.join(root,'tmp/report-xlsx-20261122');fs.mkdirSync(directory,{recursive:true});let blob,download;
const box={exports:{},TextEncoder,Uint8Array,Blob,URL:{createObjectURL(value){blob=value;return 'blob:fixture';},revokeObjectURL(){}},document:{createElement(){return {set download(value){download=value;},set href(value){assert.equal(value,'blob:fixture');},click(){}};}}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/admin/app/lib/xlsx.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,box);
const rows=[['=SUM(1,1)','  Başlangıç\nİkinci\tSatır  ',75.25,0,null,'Türkçe & <Ürün> "Çay"', 'A\u0000B\u0007C\ufffeD\uffff', '🌿'],Array.from({length:28},(_,index)=>index)];
const fixtures=[['entity','A'.repeat(30)+'&very long','A'.repeat(30)+'&'],['invalid',"'[]:/\\?*'\u0000",'Sayfa 1'],['unicode','A'.repeat(30)+'🌿','A'.repeat(30)],['quoted',"O'Brien & Satış","O'Brien & Satış"]];
async function main(){
 const manifest=[];
 for(const [name,sheet,expectedName] of fixtures){
  box.exports.downloadXlsx(name,sheet,rows);assert.equal(download,name+'.xlsx');const bytes=new Uint8Array(await blob.arrayBuffer()),files=unzipSync(bytes);assert.equal(Object.keys(files).length,5);const worksheet=strFromU8(files['xl/worksheets/sheet1.xml']);
  assert(!worksheet.includes('<f>'),'Formula-like user content must remain a typed string');assert(worksheet.includes('=SUM(1,1)'));assert(worksheet.includes('xml:space="preserve"'));assert(worksheet.includes('<c r="C1"><v>75.25</v></c>'));assert(worksheet.includes('<c r="AB2"><v>27</v></c>'));assert(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(worksheet));assert(worksheet.includes('ABCD'));
  const file=name+'.xlsx';fs.writeFileSync(path.join(directory,file),bytes);manifest.push({file,expectedName});
 }
 fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest));console.log('XLSX ZIP checks passed: literal formulas, preserved whitespace, numeric amounts, extended columns, cleaned XML characters and four generated name fixtures. Run verify-report-xlsx.ps1 for strict independent XML parsing.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
