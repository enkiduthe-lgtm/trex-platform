// Actual commission SQL in an isolated synthetic PostgreSQL database. Never calls a live service.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),{PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite')),cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const box={exports:{},require(name){if(name==='@nestjs/common')return {Injectable:()=>t=>t,BadRequestException:Error,ConflictException:Error,NotFoundException:Error,ForbiddenException:Error};if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));return require(name);}};cache.set(file,box.exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,box);return box.exports;}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function main(){
 const pg=new PGlite();let queryCount=0;const locks=[];const db={async query(sql,args=[]){queryCount++;if(sql.includes('pg_advisory_xact_lock'))locks.push(args[0]);const result=await pg.query(sql,args);return {rows:result.rows,rowCount:Math.max(result.affectedRows??0,result.rows.length)};},async transaction(work){await pg.exec('BEGIN');try{const result=await work(db);await pg.exec('COMMIT');return result;}catch(error){await pg.exec('ROLLBACK');throw error;}}};
 try{
 await pg.exec(`CREATE TABLE commission_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dealer_id uuid,recipient_user_id uuid,recipient_kind text,order_id uuid,order_item_id uuid,rule_id uuid,amount numeric(12,2),currency text,status text,entry_kind text,source_entry_id uuid,return_id uuid,calculation_source text,note text,reversed_at timestamptz);
 CREATE UNIQUE INDEX reversal_source ON commission_entries(source_entry_id) WHERE entry_kind='REVERSAL' AND return_id IS NULL;
 CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);`);
 const {CommissionsService}=load(path.join(root,'apps/api/src/commissions/commissions.service.ts')),service=new CommissionsService(db),actor={id:id(1),role:'SUPER_ADMIN'},order=id(10);
 async function entry(n,orderId,recipient,status='CONFIRMED'){await db.query("INSERT INTO commission_entries(id,recipient_user_id,recipient_kind,order_id,order_item_id,amount,currency,status,entry_kind,calculation_source) VALUES($1,$2,'STAFF',$3,$4,$5,'TRY',$6,'EARN','LEGACY')",[id(n),id(recipient),orderId,id(n+100),n,status]);}
 await entry(20,order,2);await entry(21,order,3);await entry(22,order,2);await entry(23,order,4,'PAID');
 assert.equal((await service.reverse(id(20),{note:'Only selected earning'},actor)).reversed,1,'A row action must not reverse other recipients or other products in the same order');
 assert.equal((await db.query("SELECT count(*)::int count FROM commission_entries WHERE entry_kind='REVERSAL'")).rows[0].count,1);
 assert.equal((await db.query('SELECT source_entry_id FROM commission_entries WHERE entry_kind=\'REVERSAL\'')).rows[0].source_entry_id,id(20));
 assert.equal((await db.query('SELECT status FROM commission_entries WHERE id=$1',[id(20)])).rows[0].status,'REVERSED');
 for(const n of [21,22,23])assert.equal((await db.query('SELECT status FROM commission_entries WHERE id=$1',[id(n)])).rows[0].status,n===23?'PAID':'CONFIRMED');
 const audit=(await db.query("SELECT metadata FROM audit_logs WHERE action='commission.reversed'")).rows[0].metadata;assert.equal(audit.entryId,id(20));assert.equal(audit.count,1);
 assert.equal((await service.reverse(id(20),{note:'Retry'},actor)).reversed,0,'Repeating the selected reversal must not create another entry');
 assert.equal((await service.reverseForOrder(order,actor.id,'Whole order return')).reversed,3,'Order-return reversal intentionally still reaches all remaining earnings');
 assert.equal((await service.reverseForOrder(order,actor.id,'Whole order replay')).reversed,0);
 await entry(30,id(11),2);await entry(31,id(11),3);
 await pg.exec("CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic audit failure'; END $$; CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit();");
 await assert.rejects(()=>service.reverse(id(30),{note:'Rollback'},actor));
 assert.equal((await db.query('SELECT status FROM commission_entries WHERE id=$1',[id(30)])).rows[0].status,'CONFIRMED');assert.equal((await db.query('SELECT id FROM commission_entries WHERE source_entry_id=$1',[id(30)])).rowCount,0);
 await pg.exec('DROP TRIGGER fail_audit ON audit_logs');assert.equal((await service.reverse(id(30),{note:'Retry after rollback'},actor)).reversed,1);
 assert.equal((await db.query('SELECT status FROM commission_entries WHERE id=$1',[id(31)])).rows[0].status,'CONFIRMED');
 await assert.rejects(()=>service.reverse(id(99),{},actor));const before=queryCount;await assert.rejects(()=>service.reverse(id(31),{},{...actor,role:'ADMIN'}));assert.equal(queryCount,before);
 const product=id(500).replace(/^0/,'a');
 await pg.exec(`CREATE TABLE products(id uuid PRIMARY KEY,status text);CREATE TABLE users(id uuid PRIMARY KEY,is_active boolean,role text);
 CREATE TABLE commission_rules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid,recipient_user_id uuid,recipient_kind text,sales_channel_group text,amount_per_unit numeric(12,2),currency text,created_by uuid,is_active boolean DEFAULT true,starts_at timestamptz DEFAULT now(),ends_at timestamptz,ended_by uuid);
 INSERT INTO products VALUES('${product}','ACTIVE');INSERT INTO users VALUES('${id(2)}',true,'ADMIN');`);
 const dto={productId:product,recipientUserId:id(2),recipientKind:'STAFF',salesChannelGroup:'RETAIL',amountPerUnit:2.10};
 const rule=await service.createStaffRule(dto,actor);assert.equal(rule.updated,false);
 const replay=await service.createStaffRule(dto,actor);assert.equal(replay.id,rule.id);assert.equal(replay.unchanged,true);assert.equal((await db.query("SELECT count(*)::int count FROM audit_logs WHERE action='commission.rule.created'")).rows[0].count,1);
 const changed=await service.createStaffRule({...dto,amountPerUnit:3.20},actor);assert.equal(changed.id,rule.id);assert.equal((await db.query("SELECT metadata FROM audit_logs WHERE action='commission.rule.updated'")).rows[0].metadata.previousAmount,'2.10');assert.equal((await db.query('SELECT amount_per_unit FROM commission_rules WHERE id=$1',[rule.id])).rows[0].amount_per_unit,'3.20');
 await service.createStaffRule({...dto,productId:dto.productId.toUpperCase(),recipientUserId:dto.recipientUserId.toUpperCase(),amountPerUnit:3.20},actor);assert(locks.every(key=>key===locks[0]),'Equivalent UUID case must share the same transaction lock');
 const duplicate=(await db.query("INSERT INTO commission_rules(product_id,recipient_user_id,recipient_kind,sales_channel_group,amount_per_unit,currency) VALUES($1,$2,'STAFF','RETAIL',99,'TRY') RETURNING id",[dto.productId,dto.recipientUserId])).rows[0].id;
 await assert.rejects(()=>service.createStaffRule({...dto,amountPerUnit:4},actor));assert.equal((await db.query('SELECT amount_per_unit FROM commission_rules WHERE id=$1',[rule.id])).rows[0].amount_per_unit,'3.20');
 await service.deactivateRule(duplicate,actor);assert.equal((await db.query('SELECT is_active FROM commission_rules WHERE id=$1',[duplicate])).rows[0].is_active,false);
 await pg.exec('CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit()');
 await assert.rejects(()=>service.createStaffRule({...dto,amountPerUnit:4},actor));assert.equal((await db.query('SELECT amount_per_unit FROM commission_rules WHERE id=$1',[rule.id])).rows[0].amount_per_unit,'3.20');
 await assert.rejects(()=>service.deactivateRule(rule.id,actor));assert.equal((await db.query('SELECT is_active FROM commission_rules WHERE id=$1',[rule.id])).rows[0].is_active,true);
 await assert.rejects(()=>service.createStaffRule({...dto,salesChannelGroup:'WHOLESALE'},actor));assert.equal((await db.query("SELECT count(*)::int count FROM commission_rules WHERE sales_channel_group='WHOLESALE'")).rows[0].count,0);
 assert.equal((await db.query('SELECT amount FROM commission_entries WHERE id=$1',[id(20)])).rows[0].amount,'20.00','Rule edits must not recalculate historical earnings');
 await pg.exec('DROP TRIGGER fail_audit ON audit_logs');
 console.log('Selected commission reversal passed: one recipient/product only, audit scope, replay, paid-history preservation, all-order return behavior, atomic rollback and director-only mutation.');
 console.log('Legacy rule lifecycle passed: key-scoped lock, replay, audited edit/deactivation, duplicate-configuration refusal, rollback and immutable historical earnings. Separate production connections were not available for a concurrent-writer test.');
 }finally{await pg.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
