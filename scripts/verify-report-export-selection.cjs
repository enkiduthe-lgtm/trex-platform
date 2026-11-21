const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript'));
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const helper={exports:{},URLSearchParams};vm.runInNewContext(transpile(fs.readFileSync(path.join(root,'apps/admin/app/lib/report-period.ts'),'utf8')),helper);
function setup(file,endText){
 const source=fs.readFileSync(path.join(root,file),'utf8'),start=source.indexOf(' function exportReport()'),end=source.indexOf(endText,start);assert(start>=0&&end>start);
 const period={dateFrom:'2026-11-01',dateTo:'2026-11-21',currency:'TRY'},calls=[];
 const box=vm.createContext({Date,URLSearchParams,reportSelectionMatches:helper.exports.reportSelectionMatches,busy:false,filters:{...period},data:{...period,stockAsOf:'2026-11-21T10:00:00Z',summary:{},totals:{order_count:1,revenue:'120.01',average_order:'120.01'},financial:{income:'100.00',expense:'10.01',net:'89.99'},daily:[],channels:[],statuses:[],topProducts:[]},summaryLabels:[],reportSections:[],channel:value=>value,statusName:value=>value,downloadXlsx:(...args)=>calls.push(args)});
 vm.runInContext(transpile(source.slice(start,end)),box);return {box,calls};
}
for(const [file,end] of [['apps/admin/app/raporlar/page.tsx',' const shownCatalog='],['apps/admin/app/raporlar/ozel/page.tsx',' return <main']]){
 const app=setup(file,end);app.box.filters.currency='EUR';app.box.exportReport();assert.equal(app.calls.length,0,'Changing currency cannot export the previous report');app.box.filters.currency='TRY';app.box.filters.dateTo='2026-11-22';app.box.exportReport();assert.equal(app.calls.length,0,'Changing dates cannot export the previous report');
 app.box.filters.dateTo='2026-11-21';app.box.busy=true;app.box.exportReport();assert.equal(app.calls.length,0);app.box.busy=false;app.box.exportReport();assert.equal(app.calls.length,1);assert(app.calls[0][0].includes('2026-11-01-2026-11-21-TRY'));assert(app.calls[0][2].some(row=>row[0]==='Para Birimi'&&row[1]==='TRY'));
}
console.log('Report exports passed: changed dates/currency and loading block exports; matching displayed snapshots retain exact file metadata in management and special reports.');
