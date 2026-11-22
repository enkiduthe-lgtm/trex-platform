// Bounded local regression batch. Every listed check uses synthetic data or mocked UI handlers.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const checks=[
 ['management-sql','verify-management-report.cjs','root','dependencies'],
 ['delivery-reconciliation','verify-delivery-reconciliation.cjs','dependencies'],
 ['tracking-leases','verify-tracking-leases.cjs','dependencies'],
 ['selected-commission-reversal','verify-selected-commission-reversal.cjs','dependencies'],
 ['staff-pools','verify-staff-pools.cjs','root','dependencies'],
 ['dealer-wallet','verify-dealer-wallet.cjs','root','dependencies'],
 ['report-validation','verify-report-read-isolation.cjs'],
 ['report-export','verify-report-export-selection.cjs'],
 ['report-period','verify-report-period.cjs','root'],
 ['report-view','verify-management-report-view.cjs'],
 ['dashboard-data','verify-dashboard-data.cjs'],
 ['dashboard-refresh','verify-dashboard-refresh.cjs'],
 ['dashboard-view','verify-dashboard-view.cjs'],
 ['commission-workspace','verify-legacy-commission-workspace.cjs'],
 ['commission-view','verify-legacy-commission-view.cjs'],
 ['shipment-sync','verify-manager-shipment-sync.cjs'],
 ['shipment-view','verify-manager-shipment-view.cjs'],
 ['shipment-export','verify-shipment-reconciliation-export.cjs'],
 ['audit-workspace','verify-audit-workspace.cjs'],
 ['audit-view','verify-audit-view.cjs'],
];
function main(){
 if(process.argv.includes('--list')){for(const [label,file] of checks)console.log(label+': scripts/'+file);return;}
 if(!process.argv[2])throw Error('Usage: node scripts/verify-panel-regressions.cjs <folder-containing-node_modules-and-pglite>');
 const dependencies=path.resolve(process.argv[2]);
 for(const file of [path.join(root,'node_modules/typescript/package.json'),path.join(dependencies,'node_modules/@electric-sql/pglite/package.json')])if(!fs.existsSync(file))throw Error('Required local test dependency is missing: '+file);
 const startedAt=new Date().toISOString(),directory=path.join(root,'tmp','panel-regression-'+startedAt.replace(/[:.]/g,'-'));
 fs.mkdirSync(directory,{recursive:true});
 const report={startedAt,completedAt:null,scope:'isolated_local_only',browserVisualCheck:false,liveEnvironmentModified:false,checks:[]};
 const receipt=path.join(directory,'results.json');
 const env={NODE_ENV:'test'};
 // These checks need the runtime, local packages and temporary files, not live-service credentials.
 for(const key of ['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','TMPDIR','USERPROFILE','HOME','COMSPEC','APPDATA','LOCALAPPDATA'])if(process.env[key]!==undefined)env[key]=process.env[key];
 for(const [label,file,...arguments] of checks){
   const start=Date.now(),args=arguments.map(value=>value==='root'?root:dependencies),log=path.join(directory,label+'.log');
   process.stdout.write('Checking '+label+'...\n');
   const result=spawnSync(process.execPath,['--liftoff-only','--wasm-num-compilation-tasks=1',path.join(root,'scripts',file),...args],{cwd:root,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:16*1024*1024});
   const error=result.error?result.error.message:null,passed=!error&&result.status===0;
   fs.writeFileSync(log,[result.stdout??'',result.stderr??'',error??''].filter(Boolean).join('\n'),'utf8');
   report.checks.push({name:label,status:passed?'passed':'failed',exitCode:result.status,signal:result.signal??null,durationMs:Date.now()-start,log:path.relative(root,log).replaceAll('\\','/')});
   fs.writeFileSync(receipt,JSON.stringify(report,null,2)+'\n','utf8');
   if(!passed){report.completedAt=new Date().toISOString();fs.writeFileSync(receipt,JSON.stringify(report,null,2)+'\n','utf8');console.error('Failed '+label+'. Review '+path.relative(root,log));process.exitCode=1;return;}
 }
 report.completedAt=new Date().toISOString();fs.writeFileSync(receipt,JSON.stringify(report,null,2)+'\n','utf8');
 console.log('Passed '+checks.length+' isolated panel checks. Receipt: '+path.relative(root,receipt));
 console.log('This does not replace API tests, production builds, browser review or live acceptance checks.');
}
try{main();}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
