const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ts=require(path.join(root,'node_modules/typescript')),{PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite'));
const box={exports:{},Date,require(name){if(name==='@nestjs/common')return {Injectable:()=>type=>type,BadRequestException:Error,ConflictException:Error,NotFoundException:Error};return {};}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/api/src/customers/customers.service.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,box);
async function main(){
 const pg=new PGlite(),calls=[];await pg.exec(`CREATE TABLE customers(id int,email text,is_active boolean,created_at timestamptz);
 INSERT INTO customers VALUES(1,'private-one@example.invalid',true,'2026-11-21T20:59:59Z'),(2,'private-two@example.invalid',false,'2026-11-21T21:00:00Z'),(3,'private-three@example.invalid',true,'2026-11-22T20:59:59Z'),(4,'private-four@example.invalid',true,'2026-11-22T21:00:00Z');`);
 const service=new box.exports.CustomersService({query:async(sql,args)=>{calls.push({sql,args});return {rows:(await pg.query(sql,args)).rows};}});
 const today=await service.registrationReport('2026-11-22','2026-11-22');assert.equal(today.count,2);assert.equal(today.active,1);assert.deepEqual(JSON.parse(JSON.stringify(today.rows)),[{day:'2026-11-22',count:2,active:1}]);assert(!JSON.stringify(today).includes('private-'));
 const all=await service.registrationReport();assert.equal(all.count,4);assert.equal(all.active,3);assert.equal(all.dateFrom,'');assert.equal(all.rows.length,3);
 assert.equal((await service.registrationReport(undefined,'2026-11-22')).count,3);assert.equal((await service.registrationReport('2026-11-22')).count,3);
 const before=calls.length;await assert.rejects(service.registrationReport('2026-02-30'));await assert.rejects(service.registrationReport('2026-11-23','2026-11-22'));assert.equal(calls.length,before);
 assert(calls.every(call=>!/(email|phone|first_name|last_name)/.test(call.sql)));await pg.close();console.log('Registration SQL passed: Istanbul midnight boundaries, inclusive final day, all-history and one-sided periods, active counts, exact totals and no customer contact data. Read-only isolated data.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
