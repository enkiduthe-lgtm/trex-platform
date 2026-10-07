// Run with PGLITE_MODULE pointing to a separately installed @electric-sql/pglite.
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const assert=require('node:assert/strict');
async function main(){
 const db=new PGlite();
 try{
 await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),checkout_id uuid UNIQUE); CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),checkout_id uuid,provider text,provider_reference text,status text,amount numeric(12,2),currency char(3),verified_at timestamptz); CREATE TABLE payment_callbacks(provider text,event_id text,payload jsonb); CREATE TABLE audit_logs(actor_user_id uuid,action text,entity_type text,entity_id text,metadata jsonb);`);
 for(const name of ['022_finance_accounts.sql','025_collection_approval.sql','033_paytr_cash.sql']) await db.exec(readFileSync(join(__dirname,'../migrations',name),'utf8'));
 async function payment(reference,mode,amount='759.99'){
  const checkout=(await db.query('SELECT gen_random_uuid() id')).rows[0].id;
  await db.query('INSERT INTO orders(checkout_id) VALUES($1)',[checkout]);
  await db.query("INSERT INTO payment_callbacks VALUES('paytr',$1,$2)",[reference,JSON.stringify(mode===null?{}:{test_mode:mode})]);
  const id=(await db.query("INSERT INTO payments(checkout_id,provider,provider_reference,status,amount,currency) VALUES($1,'paytr',$2,'PENDING',$3,'TRY') RETURNING id",[checkout,reference,amount])).rows[0].id;
  await db.query("UPDATE payments SET status='SUCCEEDED',verified_at=now() WHERE id=$1",[id]);return id;
 }
 const sandbox=await payment('test','1');
 assert.equal((await db.query('SELECT count(*) n FROM finance_transactions')).rows[0].n,0);
 assert.equal((await db.query('SELECT is_test FROM paytr_receipts WHERE payment_id=$1',[sandbox])).rows[0].is_test,true);
 const live=await payment('live','0');
 const receipt=(await db.query('SELECT * FROM paytr_receipts WHERE payment_id=$1',[live])).rows[0];
 assert.equal(receipt.commission_amount,'28.04');assert.equal(receipt.net_amount,'731.95');
 const balance=async()=> (await db.query("SELECT SUM(CASE WHEN kind='COMMISSION' THEN -amount ELSE amount END)::text amount FROM finance_transactions")).rows[0].amount;
 assert.equal(await balance(),'731.95');
 await db.query("UPDATE payments SET status='SUCCEEDED' WHERE id=$1",[live]);
 assert.equal((await db.query('SELECT count(*) n FROM finance_transactions')).rows[0].n,2);
 await db.exec('UPDATE paytr_finance_settings SET commission_rate=5');
 const next=await payment('new-rate','0','100');
 assert.equal((await db.query('SELECT net_amount FROM paytr_receipts WHERE payment_id=$1',[next])).rows[0].net_amount,'95.00');
 assert.equal((await db.query('SELECT commission_rate FROM paytr_receipts WHERE payment_id=$1',[live])).rows[0].commission_rate,'3.69');
 await payment('unknown-mode',null);
 assert.equal(await balance(),'826.95');
 await db.exec('UPDATE paytr_finance_settings SET commission_rate=0');await payment('no-fee','0','100');assert.equal(await balance(),'926.95');
 await assert.rejects(db.exec('UPDATE paytr_finance_settings SET commission_rate=101'));
 await db.exec('BEGIN');await payment('rolled-back','0','100');await db.exec('ROLLBACK');assert.equal(await balance(),'926.95');
 console.log('PayTR cash SQL checks passed: sandbox isolation, exact rounding, replay protection, immutable rate snapshots, zero rate, validation and atomic rollback.');
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
