// Actual authentication service and migration against isolated SQL; synthetic signed claims only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),{PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite'));
const box={exports:{},Date,process:{env:{}},require(name){if(name==='@nestjs/common')return {Injectable:()=>type=>type,Optional:()=>()=>{},BadRequestException:Error,ConflictException:Error,NotFoundException:Error,UnauthorizedException:Error};if(name==='crypto')return crypto;if(name==='./roles')return {Roles:{SUPER_ADMIN:'SUPER_ADMIN',ADMIN:'ADMIN',DEALER:'DEALER'}};return {};}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/api/src/auth/auth.service.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,box);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
 const pg=new PGlite();let tail=Promise.resolve();const calls=[];
 const client={async query(sql,args=[]){calls.push({sql,args});const result=await pg.query(sql,args);return {rows:result.rows,rowCount:result.affectedRows??result.rows.length};}};
 const serial=work=>{const run=tail.then(work);tail=run.catch(()=>{});return run;};
 const db={query:(...args)=>serial(()=>client.query(...args)),transaction:work=>serial(async()=>{await pg.exec('BEGIN');try{const result=await work(client);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}})};
 await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY,email text,role text,is_active boolean);
 CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users,token_hash text UNIQUE,expires_at timestamptz,revoked_at timestamptz,ip inet,user_agent text,created_at timestamptz DEFAULT now());
 CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
 INSERT INTO users VALUES('${id(1)}','synthetic@example.invalid','ADMIN',true),('${id(2)}','other@example.invalid','ADMIN',true);
 INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES('${id(10)}','${id(1)}','${hash('initial')}',now()+interval '1 hour');`);
 const migration=fs.readFileSync(path.join(root,'apps/api/migrations/083_session_families.sql'),'utf8');await pg.exec(migration);const originalFamily=(await pg.query('SELECT family_id FROM sessions')).rows[0].family_id;await pg.exec(migration);assert.equal((await pg.query('SELECT family_id FROM sessions')).rows[0].family_id,originalFamily,'Rerunning the migration must preserve existing login families');
 const jwt={signAsync:async claims=>JSON.stringify(claims),verifyAsync:async token=>{const claims=JSON.parse(token);if(claims.invalid)throw Error('signature');return claims;}};
 const service=new box.exports.AuthService(db,jwt,{}),claims=(sid,sub=id(1))=>({sub,sid,email:'synthetic@example.invalid',role:'ADMIN'});
 const active=async user=>(await db.query('SELECT id,family_id FROM sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY id',[user])).rows;
 const seed=async()=>{await db.query('TRUNCATE sessions,audit_logs');await db.query("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour'),($4,$2,$5,now()+interval '1 hour'),($6,$7,$8,now()+interval '1 hour')",[id(10),id(1),hash('initial'),id(20),hash('other-login'),id(30),id(2),hash('other-user')]);};
 await seed();const original=await active(id(1)),first=await service.rotate('initial',{}),next=await service.rotate(first.refreshToken,{});assert.equal((await active(id(1))).length,2);const renewed=JSON.parse(next.accessToken);assert.equal((await db.query('SELECT family_id FROM sessions WHERE id=$1',[renewed.sid])).rows[0].family_id,original.find(row=>row.id===id(10)).family_id);
 await service.logout('initial');assert.deepEqual((await active(id(1))).map(row=>row.id),[id(20)],'An older refresh cookie must close every replacement from its own login');assert.equal((await active(id(2))).length,1);await assert.rejects(service.rotate(next.refreshToken,{}));
 await seed();const renewal=await service.rotate('initial',{});await service.logout('',JSON.stringify(claims(id(10))));assert.deepEqual((await active(id(1))).map(row=>row.id),[id(20)],'A signed original access token must revoke its already rotated replacement');await assert.rejects(service.rotate(renewal.refreshToken,{}));
 await seed();await service.logout('initial');await assert.rejects(service.rotate('initial',{}));assert.deepEqual((await active(id(1))).map(row=>row.id),[id(20)],'Logout committed before renewal must prevent a new session');
 await seed();await service.rotate('initial',{});await service.revokeSession(claims(id(20)),id(10));assert.deepEqual((await active(id(1))).map(row=>row.id),[id(20)],'Closing a listed device must follow its rotation');assert.equal((await db.query('SELECT * FROM audit_logs')).rows.length,1);
 await seed();await service.rotate('initial',{});await assert.rejects(service.revokeSession(claims(id(10)),id(99)),/Açık Oturum/);
 assert.equal((await active(id(1))).length,2);
 await seed();const current=await service.rotate('initial',{});await assert.rejects(service.revokeSession(claims(JSON.parse(current.accessToken).sid),id(10)),/Bu Cihazdaki/);assert.equal((await active(id(1))).length,2);
 const others=await service.revokeOtherSessions(claims(id(10)));assert.equal(others.revokedCount,1);assert.deepEqual((await active(id(1))).map(row=>row.id),[JSON.parse(current.accessToken).sid],'Revoke others must preserve a replacement of the current login');assert.equal((await active(id(2))).length,1);
 await seed();await service.logout('',JSON.stringify({...claims(id(30)),invalid:true}));assert.equal((await active(id(1))).length,2);assert.equal((await active(id(2))).length,1);await service.logout('',JSON.stringify(claims(id(30))));assert.equal((await active(id(2))).length,1,'A valid token cannot revoke a session belonging to another user');
 await seed();await db.query("UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE id=$1",[id(10)]);await assert.rejects(service.rotate('initial',{}));
 await seed();await db.query('UPDATE users SET is_active=false WHERE id=$1',[id(1)]);await assert.rejects(service.rotate('initial',{}));await db.query('UPDATE users SET is_active=true WHERE id=$1',[id(1)]);
 for(let i=0;i<calls.length;i++)if(calls[i].sql.includes('FROM sessions s JOIN users'))assert(calls.slice(0,i).some(call=>call.sql.includes('pg_advisory_xact_lock')),'Rotation validation must run after its account serialization lock');
 assert(calls.some(call=>call.sql.includes('(user_id,family_id) IN')));await pg.close();console.log('Session family SQL passed: idempotent migration, two rotations, both logout orderings, expired bearer logout, stale device close, current-family preservation, other-account isolation and invalid/expired/inactive rejection. All accounts and tokens synthetic; no production authentication.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
