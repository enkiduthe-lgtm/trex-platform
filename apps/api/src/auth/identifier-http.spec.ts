import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import * as argon2 from 'argon2';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottleService } from './auth-throttle.service';
import { MfaService } from './mfa.service';
import { AdminController } from './admin.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { DatabaseService } from '../database/database.service';
import { CustomersController } from '../customers/customers.controller';
import { CustomersService } from '../customers/customers.service';
import { DealersController } from '../dealers/dealers.controller';
import { DealersService } from '../dealers/dealers.service';

jest.mock('argon2',()=>({argon2id:2,hash:jest.fn().mockResolvedValue('synthetic-password-hash')}));

// Real Nest route/guard/pipe/body handling, fake identities and services. No sockets or real writes.
describe('Identifier validation at the HTTP boundary',()=>{
  let app:any;
  const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
  const db={query:jest.fn().mockResolvedValue({rows:[],rowCount:0}),transaction:jest.fn().mockResolvedValue({id})};
  const auth={revokeSession:jest.fn().mockResolvedValue({revoked:true})};
  const customers={notes:jest.fn().mockResolvedValue([]),orders:jest.fn().mockResolvedValue([]),orderReport:jest.fn().mockResolvedValue({}),supportTickets:jest.fn().mockResolvedValue([]),addNote:jest.fn().mockResolvedValue({}),loyalty:jest.fn().mockResolvedValue({}),adjustLoyalty:jest.fn().mockResolvedValue({}),requests:jest.fn().mockResolvedValue([]),createRequest:jest.fn().mockResolvedValue({}),updateRequest:jest.fn().mockResolvedValue({}),assignTag:jest.fn().mockResolvedValue({}),removeTag:jest.fn().mockResolvedValue({})};
  const dealers={updateLevel:jest.fn().mockResolvedValue({}),updateStatus:jest.fn().mockResolvedValue({}),setParent:jest.fn().mockResolvedValue({}),setPriceGroup:jest.fn().mockResolvedValue({}),setLevel:jest.fn().mockResolvedValue({}),commercialSummary:jest.fn().mockResolvedValue({}),addBankAccount:jest.fn().mockResolvedValue({}),addLedgerEntry:jest.fn().mockResolvedValue({})};
  function invoke(method:string,path:string,role:string|undefined,body?:unknown):Promise<number>{
    return new Promise((resolve,reject)=>{
      const socket=new Duplex({read(){},write(_chunk,_encoding,callback){callback();}}),req=new IncomingMessage(socket as never),res=new ServerResponse(req);
      req.method=method;req.url=path;req.httpVersion='1.1';req.headers=role?{'x-test-role':role}:{};
      const payload=body===undefined?null:JSON.stringify(body);
      if(payload!==null){req.headers['content-type']='application/json';req.headers['content-length']=String(Buffer.byteLength(payload));}
      res.assignSocket(socket as never);
      const timer=setTimeout(()=>{socket.destroy();reject(new Error('In-memory request timed out'));},5000);
      const fail=(error:Error)=>{clearTimeout(timer);socket.destroy();reject(error);};res.once('error',fail);socket.once('error',fail);
      res.once('finish',()=>{clearTimeout(timer);res.detachSocket(socket as never);socket.destroy();resolve(res.statusCode);});
      app.getHttpAdapter().getInstance()(req,res);req.complete=true;if(payload!==null)req.push(payload);req.push(null);
    });
  }
  beforeAll(async()=>{
    const module=await Test.createTestingModule({controllers:[AuthController,AdminController,CustomersController,DealersController],providers:[RolesGuard,
      {provide:DatabaseService,useValue:db},{provide:AuthService,useValue:auth},{provide:AuthThrottleService,useValue:{}},{provide:MfaService,useValue:{}},
      {provide:CustomersService,useValue:customers},{provide:DealersService,useValue:dealers},
    ]}).overrideGuard(JwtAuthGuard).useValue({canActivate(context:any){const req=context.switchToHttp().getRequest();const role=req.headers['x-test-role'];if(!role)throw new UnauthorizedException();req.user={id:other,role,email:'synthetic@example.invalid',sessionId:other};return true;}}).compile();
    app=module.createNestApplication();app.setGlobalPrefix('v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));await app.init();
  });
  afterAll(async()=>{await app?.close();});
  beforeEach(()=>{jest.clearAllMocks();});
  const routes=[
    {method:'DELETE',path:'/v1/auth/sessions/:id',body:undefined,call:auth.revokeSession},
    {method:'POST',path:'/v1/admin/account-archives/staff/:id',body:{isActive:false},call:db.transaction},
    {method:'PATCH',path:'/v1/admin/staff/:id',body:{isActive:true},call:db.transaction},
    {method:'PATCH',path:'/v1/admin/staff/:id/role',body:{role:'ADMIN'},call:db.transaction},
    {method:'POST',path:'/v1/admin/staff/:id/reset-password',body:{password:'synthetic-valid-password'},call:db.transaction},
    {method:'GET',path:'/v1/admin/customers/:id/notes',body:undefined,call:customers.notes},
    {method:'GET',path:'/v1/admin/customers/:id/orders',body:undefined,call:customers.orders},
    {method:'GET',path:'/v1/admin/customers/:id/order-report',body:undefined,call:customers.orderReport},
    {method:'GET',path:'/v1/admin/customers/:id/support-tickets',body:undefined,call:customers.supportTickets},
    {method:'POST',path:'/v1/admin/customers/:id/notes',body:{body:'Synthetic note'},call:customers.addNote},
    {method:'GET',path:'/v1/admin/customers/:id/loyalty',body:undefined,call:customers.loyalty},
    {method:'POST',path:'/v1/admin/customers/:id/loyalty/adjust',body:{points:1,reason:'Synthetic validation'},call:customers.adjustLoyalty},
    {method:'GET',path:'/v1/admin/customers/:id/requests',body:undefined,call:customers.requests},
    {method:'POST',path:'/v1/admin/customers/:id/requests',body:{subject:'Synthetic',body:'Synthetic',priority:'NORMAL'},call:customers.createRequest},
    {method:'PATCH',path:'/v1/admin/customers/'+id+'/requests/:id',body:{status:'RESOLVED'},call:customers.updateRequest},
    {method:'POST',path:'/v1/admin/customers/'+id+'/tags/:id',body:undefined,call:customers.assignTag},
    {method:'DELETE',path:'/v1/admin/customers/'+id+'/tags/:id',body:undefined,call:customers.removeTag},
    {method:'POST',path:'/v1/admin/customers/:id/tags/'+other,body:undefined,call:customers.assignTag},
    {method:'DELETE',path:'/v1/admin/customers/:id/tags/'+other,body:undefined,call:customers.removeTag},
    {method:'PATCH',path:'/v1/admin/dealers/levels/:id',body:{name:'Synthetic level'},call:dealers.updateLevel},
    {method:'PATCH',path:'/v1/admin/dealers/:id/status',body:{status:'ACTIVE'},call:dealers.updateStatus},
    {method:'PATCH',path:'/v1/admin/dealers/:id/parent',body:{parentDealerId:other},call:dealers.setParent},
    {method:'PATCH',path:'/v1/admin/dealers/:id/price-group',body:{priceGroupId:other},call:dealers.setPriceGroup},
    {method:'PATCH',path:'/v1/admin/dealers/:id/level',body:{dealerLevelId:other},call:dealers.setLevel},
    {method:'GET',path:'/v1/admin/dealers/:id/commercial',body:undefined,call:dealers.commercialSummary},
    {method:'POST',path:'/v1/admin/dealers/:id/bank-accounts',body:{accountHolder:'Synthetic holder',iban:'TR'+'1'.repeat(24)},call:dealers.addBankAccount},
    {method:'POST',path:'/v1/admin/dealers/:id/ledger',body:{direction:'CREDIT',amount:1,referenceType:'TEST',description:'Synthetic validation'},call:dealers.addLedgerEntry},
  ];
  describe.each(routes)('$method $path',route=>{
    it.each(['invalid','123','00000000-0000-4000-8000-00000000000Z','bad%2Fpath'])('rejects %s before invoking a service or password hash',async invalid=>{
      expect(await invoke(route.method,route.path.replace(':id',invalid),'SUPER_ADMIN',route.body)).toBe(400);
      expect(route.call).not.toHaveBeenCalled();expect(db.transaction).not.toHaveBeenCalled();expect(argon2.hash).not.toHaveBeenCalled();
    });
    it('retains the valid identifier flow',async()=>{
      expect(await invoke(route.method,route.path.replace(':id',id),'SUPER_ADMIN',route.body)).toBe(route.method==='POST'?201:200);
      expect(route.call).toHaveBeenCalledTimes(1);
    });
  });
  it('requires authentication before exposing parameter validation',async()=>{
    expect(await invoke('DELETE','/v1/auth/sessions/invalid',undefined)).toBe(401);expect(auth.revokeSession).not.toHaveBeenCalled();
  });
  it('retains director-only staff changes for a manager with no special profile',async()=>{
    expect(await invoke('POST','/v1/admin/staff/'+id+'/reset-password','ADMIN',{password:'synthetic-valid-password'})).toBe(403);
    expect(argon2.hash).not.toHaveBeenCalled();expect(db.transaction).not.toHaveBeenCalled();
  });
  it('accepts a valid uppercase identifier without rewriting the selected customer',async()=>{
    const upper='A0000000-0000-4000-8000-000000000001';
    expect(await invoke('GET','/v1/admin/customers/'+upper+'/notes','SUPER_ADMIN')).toBe(200);
    expect(customers.notes).toHaveBeenCalledWith(upper);
  });
});
