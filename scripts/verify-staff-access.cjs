// Isolated PostgreSQL + actual access guard. No live credentials or user changes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(process.argv[2],'node_modules/typescript')),{PGlite}=require(path.join(process.argv[3],'node_modules/@electric-sql/pglite'));
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;const box={exports:{},require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,Optional:()=>()=>{},ForbiddenException:Error};if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return {};}};cache.set(file,box.exports);vm.runInNewContext(code,box);return box.exports;}
async function main(){
 const pg=new PGlite(),db={async query(sql,args=[]){const r=await pg.query(sql,args);return {rows:r.rows,rowCount:Math.max(r.affectedRows??0,r.rows.length)};}};
 await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,email text,role text,updated_at timestamptz,is_active boolean DEFAULT true);CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);CREATE TABLE dealer_levels(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE,name text,sort_order integer UNIQUE,is_active boolean DEFAULT true);`);
 await db.query("INSERT INTO users(id,email,role,updated_at) VALUES($1,'theenkidu@hotmail.com','ADMIN',now()),($2,'other@example.test','ADMIN',now())",[uuid(1),uuid(2)]);
 await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations/070_staff_access_and_director.sql'),'utf8'));
 assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[uuid(1)])).rows[0].role,'SUPER_ADMIN');assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[uuid(2)])).rows[0].role,'ADMIN');assert.equal((await db.query('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n,1);
 for(let n=1;n<=4;n++)await db.query('INSERT INTO dealer_levels(code,name,sort_order) VALUES($1,$2,$3)',[`L${n}`,`Level ${n}`,n]);
 await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations/071_three_dealer_levels.sql'),'utf8'));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM dealer_levels')).rows[0].n,4);assert.equal((await db.query('SELECT count(*)::int AS n FROM dealer_levels WHERE is_active')).rows[0].n,3);assert.equal((await db.query('SELECT is_active FROM dealer_levels WHERE sort_order=4')).rows[0].is_active,false);
 const {RolesGuard}=load(path.join(root,'apps/api/src/auth/roles.guard.ts'));
 const guard=new RolesGuard({getAllAndOverride:()=>['SUPER_ADMIN']},db);
 function context(role,url,method='GET'){return {getHandler:()=>({}),getClass:()=>({}),switchToHttp:()=>({getRequest:()=>({user:{id:uuid(role==='SUPER_ADMIN'?1:2),role},path:url,method})})};}
 await assert.rejects(()=>guard.canActivate(context('ADMIN','/v1/admin/finance/transactions')));
 await db.query('INSERT INTO staff_access_profiles VALUES($1,$2,$3,now())',[uuid(2),['FINANCE.VIEW','FINANCE.CREATE','ORDERS.VIEW','ORDERS.EDIT'],uuid(1)]);
 assert.equal(await guard.canActivate(context('ADMIN','/v1/admin/finance/transactions')),true);assert.equal(await guard.canActivate(context('ADMIN','/v1/admin/finance/transactions','POST')),true);
 await assert.rejects(()=>guard.canActivate(context('ADMIN','/v1/admin/finance/collections/123/approve','POST')));await assert.rejects(()=>guard.canActivate(context('ADMIN','/v1/admin/products/123','DELETE')));await assert.rejects(()=>guard.canActivate(context('ADMIN','/v1/admin/staff/123/role','PATCH')));await assert.rejects(()=>guard.canActivate(context('ADMIN','/v1/admin/access/123','PUT')));
 assert.equal(await guard.canActivate(context('ADMIN','/v1/admin/orders/123/prepare','POST')),true);
 await db.query('UPDATE staff_access_profiles SET grants=$1 WHERE user_id=$2',[[],uuid(2)]);await assert.rejects(()=>guard.canActivate(context('ADMIN','/v1/admin/orders/123/prepare','POST')));
 assert.equal(await guard.canActivate(context('SUPER_ADMIN','/v1/admin/staff')),true);assert.equal(await guard.canActivate(context('SUPER_ADMIN','/v1/returns/123/refund','POST')),true);
 await pg.close();console.log('Staff-access checks passed: exact owner promotion, other users unchanged, three active levels with historical fourth preserved, checked actions enforced, ungranted approvals/deletes/role changes denied, revocation immediate and director unrestricted.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
