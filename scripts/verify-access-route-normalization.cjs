// Real Express routing and the actual staff guard, without opening an HTTP server.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),express=require(path.join(root,'node_modules/express'));
require(path.join(root,'node_modules/reflect-metadata'));
const previous=require.extensions['.ts'];require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,file);
const {requestAccess}=require(path.join(root,'apps/api/src/auth/staff-access.ts')),{RolesGuard}=require(path.join(root,'apps/api/src/auth/roles.guard.ts'));
if(previous)require.extensions['.ts']=previous;else delete require.extensions['.ts'];
function routeMatches(route,url,method='POST'){return new Promise((resolve,reject)=>{const router=express.Router();router[method.toLowerCase()](route,()=>resolve(true));router.handle({method,url,originalUrl:url,headers:{}},{},error=>error?reject(error):resolve(false));});}
function context(path,body={},method='POST'){return {getHandler:()=>undefined,getClass:()=>undefined,switchToHttp:()=>({getRequest:()=>({user:{id:'staff',role:'ADMIN'},method,path,body})})};}
function guard(grants){return new RolesGuard({getAllAndOverride:()=>['SUPER_ADMIN']},{query:async()=>({rowCount:1,rows:[{grants}]})});}
async function main(){
 const cases=[
  ['/v1/admin/finance/transfers','/v1/admin/finance/transfers/','FINANCE.APPROVE','FINANCE.CREATE'],
  ['/v1/admin/finance/transfers/idempotent','/v1/admin/finance/transfers/IDEMPOTENT/','FINANCE.APPROVE','FINANCE.CREATE'],
  ['/v1/admin/campaigns/example/activate','/v1/admin/campaigns/example/ACTIVATE/','CAMPAIGNS.APPROVE','CAMPAIGNS.CREATE'],
  ['/v1/admin/campaigns/example/pause','/V1/ADMIN/CAMPAIGNS/example/PAUSE/','CAMPAIGNS.APPROVE','CAMPAIGNS.CREATE'],
  ['/v1/admin/finance/paytr/settings','/v1/admin/finance/paytr/SETTINGS/','FINANCE.EDIT','FINANCE.CREATE'],
 ];
 for(const [route,url,permission,wrong] of cases){assert.equal(await routeMatches(route,url),true,'The actual router must accept the path variation being checked');assert.equal(requestAccess(url,'POST'),permission);const view=permission.split('.')[0]+'.VIEW';await assert.rejects(guard([view,wrong]).canActivate(context(url)),/Yetki Verilmemiş/);assert.equal(await guard([view,permission]).canActivate(context(url)),true);}
 const statusPath='/v1/admin/orders/example/STATUS/';assert.equal(await routeMatches('/v1/admin/orders/example/status',statusPath,'PATCH'),true);
 await assert.rejects(guard(['ORDERS.VIEW','ORDERS.APPROVE']).canActivate(context(statusPath,{status:'DELIVERED'},'PATCH')),/Yetki Verilmemiş/);
 assert.equal(await guard(['ORDERS.VIEW','ORDERS.APPROVE','SHIPPING.VIEW','SHIPPING.APPROVE']).canActivate(context(statusPath,{status:'DELIVERED'},'PATCH')),true);
 for(const url of ['/v1/admin/staff','/V1/ADMIN/STAFF/','/v1/admin/access/','/admin/settings/']){assert.equal(requestAccess(url,'POST'),null);await assert.rejects(guard(['FINANCE.VIEW','FINANCE.CREATE','FINANCE.EDIT']).canActivate(context(url)),/Yetki Verilmemiş/);}
 const credentials='/V1/ADMIN/DEALERS/example/PORTAL-ACCOUNT/';assert.equal(await routeMatches('/v1/admin/dealers/:id/portal-account',credentials),true);assert.equal(requestAccess(credentials,'POST'),null);await assert.rejects(guard(['DEALERS.VIEW','DEALERS.CREATE','DEALERS.APPROVE']).canActivate(context(credentials)),/Yetki Verilmemiş/);
 assert.equal(requestAccess('/V1/ADMIN/FINANCE/ACCOUNTS/?ignored=approve','GET'),'FINANCE.VIEW');
 console.log('Route normalization passed: real-router accepted casing/trailing-slash variants retain finance approval/edit, campaign approval and shipping approval checks; protected staff/settings routes fail closed. No HTTP server, account change or money movement was created.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
