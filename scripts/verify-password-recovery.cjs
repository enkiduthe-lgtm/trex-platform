// Actual reset service and migrations with controlled notifications and password hashing.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),{PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite'));
const box={exports:{},Date,process:{env:{ADMIN_APP_URL:'https://synthetic.example.invalid'}},require(name){if(name==='@nestjs/common')return {Injectable:()=>type=>type,Optional:()=>()=>{},BadRequestException:Error,ConflictException:Error,NotFoundException:Error,UnauthorizedException:Error};if(name==='crypto')return require('node:crypto');if(name==='argon2')return {argon2id:2,hash:async password=>'synthetic-hash:'+password};if(name==='./roles')return {Roles:{SUPER_ADMIN:'SUPER_ADMIN',ADMIN:'ADMIN',WAREHOUSE:'WAREHOUSE',FINANCE:'FINANCE',DEALER:'DEALER'}};if(name.includes('create-notification.dto'))return {NotificationChannel:{EMAIL:'EMAIL'}};return {};}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/api/src/auth/auth.service.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,box);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const pg=new PGlite(),messages=[],calls=[];let tail=Promise.resolve(),beforeTransaction=null;
 const prepareValue=require(path.join(root,'node_modules/pg/lib/utils')).prepareValue;
 const client={async query(sql,args=[]){calls.push({sql,args});const result=await pg.query(sql,args.map(value=>Array.isArray(value)?prepareValue(value):value));return {rows:result.rows,rowCount:result.affectedRows??result.rows.length};}};
 const serial=work=>{const run=tail.then(work);tail=run.catch(()=>{});return run;};
 const db={query:(...args)=>serial(()=>client.query(...args)),transaction:work=>serial(async()=>{if(beforeTransaction){const hook=beforeTransaction;beforeTransaction=null;await hook();}await pg.exec('BEGIN');try{const result=await work(client);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}})};
 await pg.exec(`CREATE TYPE user_role AS ENUM('SUPER_ADMIN','ADMIN','WAREHOUSE','FINANCE','DEALER','CUSTOMER');
 CREATE TABLE users(id uuid PRIMARY KEY,email text,role user_role,is_active boolean,password_hash text,updated_at timestamptz);
 CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users,expires_at timestamptz,revoked_at timestamptz);
 CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
 INSERT INTO users VALUES('${id(1)}','synthetic@example.invalid','ADMIN',true,'original',now()),('${id(2)}','customer@example.invalid','CUSTOMER',true,'other-original',now());`);
 await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations/065_password_reset_tokens.sql'),'utf8'));
 await pg.exec(fs.readFileSync(path.join(root,'apps/api/migrations/083_session_families.sql'),'utf8'));
 const notifications={send:async value=>{messages.push(value);return {status:'PENDING'};}},service=new box.exports.AuthService(db,{}, {},notifications);
 const token=message=>new URL(message.body.match(/https:\/\/\S+/)[0]).searchParams.get('token');
 const current=async()=>(await db.query('SELECT * FROM users WHERE id=$1',[id(1)])).rows[0];
 const valid=async()=>(await db.query('SELECT * FROM password_reset_tokens WHERE used_at IS NULL')).rows;
 const first=await service.requestPasswordReset(' SYNTHETIC@EXAMPLE.INVALID ',{});assert.equal(messages.length,1);const initialToken=token(messages[0]);assert(initialToken.length>=32);assert(!(await valid())[0].token_hash.includes(initialToken),'Only the reset hash is stored');
 await service.requestPasswordReset('synthetic@example.invalid',{});assert.equal((await valid()).length,1);const latestToken=token(messages[1]);await assert.rejects(service.confirmPasswordReset(initialToken,'new-synthetic-password'),/Geçersiz/);assert.equal((await current()).password_hash,'original');
 await db.query("INSERT INTO sessions(user_id,expires_at) VALUES($1,now()+interval '1 hour'),($1,now()+interval '1 hour'),($2,now()+interval '1 hour')",[id(1),id(2)]);
 await pg.exec(`CREATE FUNCTION fail_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='auth.password_reset.completed' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$;
 CREATE TRIGGER recovery_audit_failure BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_recovery_audit();`);
 await assert.rejects(service.confirmPasswordReset(latestToken,'new-synthetic-password'),/synthetic audit failure/);assert.equal((await current()).password_hash,'original');assert.equal((await valid()).length,1);assert.equal((await db.query('SELECT id FROM sessions WHERE revoked_at IS NULL')).rows.length,3);
 await pg.exec('DROP TRIGGER recovery_audit_failure ON audit_logs');await service.confirmPasswordReset(latestToken,'new-synthetic-password');assert.equal((await current()).password_hash,'synthetic-hash:new-synthetic-password');assert.equal((await valid()).length,0);assert.deepEqual((await db.query('SELECT user_id FROM sessions WHERE revoked_at IS NULL')).rows.map(row=>row.user_id),[id(2)]);await assert.rejects(service.confirmPasswordReset(latestToken,'another-password'),/Geçersiz/);
 const count=messages.length;assert.deepEqual(await service.requestPasswordReset('missing@example.invalid',{}),first);assert.deepEqual(await service.requestPasswordReset('customer@example.invalid',{}),first);assert.equal(messages.length,count,'Missing/disallowed accounts do not receive notifications');
 beforeTransaction=()=>pg.query('UPDATE users SET is_active=false WHERE id=$1',[id(1)]);assert.deepEqual(await service.requestPasswordReset('synthetic@example.invalid',{}),first);assert.equal(messages.length,count);assert.equal((await valid()).length,0,'Deactivation between lookup and locked write must not create a token');
 await db.query('UPDATE users SET is_active=true WHERE id=$1',[id(1)]);beforeTransaction=()=>pg.query("UPDATE users SET email='changed@example.invalid' WHERE id=$1",[id(1)]);await service.requestPasswordReset('synthetic@example.invalid',{});assert.equal(messages.length,count,'Changing email during lookup must not send a new token to the old address');
 await db.query("UPDATE users SET email='synthetic@example.invalid' WHERE id=$1",[id(1)]);await service.requestPasswordReset('synthetic@example.invalid',{});const expiredToken=token(messages.at(-1));await db.query("UPDATE password_reset_tokens SET expires_at=clock_timestamp()-interval '1 second' WHERE used_at IS NULL");await assert.rejects(service.confirmPasswordReset(expiredToken,'expired-password'),/Geçersiz/);
 assert(calls.some(call=>call.sql.includes('pg_advisory_xact_lock')));assert(calls.some(call=>call.sql.includes('email=$2 AND is_active=true')&&call.sql.includes('FOR UPDATE')));assert(calls.some(call=>call.sql.includes('prt.expires_at>clock_timestamp()')));
 await pg.close();console.log('Password recovery SQL passed: latest-link-only policy, hash-only storage, atomic password/token/session/audit changes, audit rollback, repeated/expired rejection, generic absent-account response and locked active/email checks. No real email or account changed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
