import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles';
import { DatabaseService } from '../database/database.service';
import { CustomersController } from '../customers/customers.controller';
import { CustomersService } from '../customers/customers.service';
import { DealersController } from '../dealers/dealers.controller';
import { DealersService } from '../dealers/dealers.service';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { InventoryController } from '../inventory/inventory.controller';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersController } from '../orders/orders.controller';
import { OrdersService } from '../orders/orders.service';
import { AdminOrderService } from '../orders/admin-order.service';
import { WarehouseController } from '../warehouse/warehouse.controller';
import { WarehouseService } from '../warehouse/warehouse.service';
import { FinanceController } from '../finance/finance.controller';
import { FinanceService } from '../finance/finance.service';
import { CampaignsController } from '../campaigns/campaigns.controller';
import { CampaignsService } from '../campaigns/campaigns.service';

// Token verification has its own tests. Here only the identity guard is replaced;
// real route decorators and RolesGuard decide access at the HTTP boundary.
describe('V1 HTTP role boundaries', () => {
  let app: any;
  const customers = { list: jest.fn().mockResolvedValue([]) };
  const dealers = { list: jest.fn().mockResolvedValue([]) };
  const products = { listAdmin: jest.fn().mockResolvedValue([]), listCosts: jest.fn().mockResolvedValue([]), listPublic: jest.fn().mockResolvedValue([]) };
  const inventory = { adjust: jest.fn().mockResolvedValue({ physical_quantity: 1 }), reserve: jest.fn().mockResolvedValue({ id: 'reservation' }) };
  const orders = { list: jest.fn().mockResolvedValue([]), updateStatus: jest.fn().mockResolvedValue({}), cancel: jest.fn().mockResolvedValue({}) };
  const adminOrders = { options: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}) };
  const warehouse = { listStock: jest.fn().mockResolvedValue([]), deleteLocation: jest.fn().mockResolvedValue({}), receiveStock: jest.fn().mockResolvedValue({}) };
  const finance={createTransfer:jest.fn().mockResolvedValue({id:'transfer'}),updatePaytrRate:jest.fn().mockResolvedValue({commissionRate:4,changed:true})};
  const campaigns={activate:jest.fn().mockResolvedValue({}),pause:jest.fn().mockResolvedValue({})};
  const profiles:Record<string,string[]>={
    'finance-create':['FINANCE.VIEW','FINANCE.CREATE'], 'finance-approve':['FINANCE.VIEW','FINANCE.APPROVE'], 'finance-edit':['FINANCE.VIEW','FINANCE.EDIT'],
    'campaign-create':['CAMPAIGNS.VIEW','CAMPAIGNS.CREATE'], 'campaign-approve':['CAMPAIGNS.VIEW','CAMPAIGNS.APPROVE'],
    'order-approve':['ORDERS.VIEW','ORDERS.APPROVE'], 'order-shipping-approve':['ORDERS.VIEW','ORDERS.APPROVE','SHIPPING.VIEW','SHIPPING.APPROVE'],
  };
  // The real Nest/Express request pipeline runs on Node request/response objects.
  // No listener or client connection is needed in restricted test environments.
  function invoke(method:string,path:string,headers:Record<string,string>={},body?:unknown):Promise<{status:number}>{
    return new Promise((resolve,reject)=>{
      const socket=new Duplex({read(){},write(_chunk,_encoding,callback){callback();}});
      const req=new IncomingMessage(socket as never),res=new ServerResponse(req);
      req.method=method.toUpperCase();req.url=path;req.httpVersion='1.1';req.headers={...headers};
      const payload=body===undefined?null:JSON.stringify(body);
      if(payload!==null){req.headers['content-type']='application/json';req.headers['content-length']=String(Buffer.byteLength(payload));}
      res.assignSocket(socket as never);
      const timer=setTimeout(()=>{socket.destroy();reject(new Error('In-memory HTTP response timed out'));},5000);
      const fail=(error:Error)=>{clearTimeout(timer);socket.destroy();reject(error);};
      res.once('error',fail);socket.once('error',fail);
      res.once('finish',()=>{clearTimeout(timer);res.detachSocket(socket as never);socket.destroy();resolve({status:res.statusCode});});
      app.getHttpAdapter().getInstance()(req,res);
      req.complete=true;if(payload!==null)req.push(payload);req.push(null);
    });
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomersController, DealersController, ProductsController, InventoryController, OrdersController, WarehouseController,FinanceController,CampaignsController],
      providers: [RolesGuard, { provide: DatabaseService, useValue: {query:jest.fn(async(_sql:string,args:string[]=[])=>profiles[args[0]]?{rows:[{grants:profiles[args[0]]}],rowCount:1}:{rows:[],rowCount:0})} }, { provide: CustomersService, useValue: customers },
        { provide: DealersService, useValue: dealers }, { provide: ProductsService, useValue: products },
        { provide: InventoryService, useValue: inventory }, { provide: OrdersService, useValue: orders },
        { provide: AdminOrderService, useValue: adminOrders }, { provide: WarehouseService, useValue: warehouse },{provide:FinanceService,useValue:finance},{provide:CampaignsService,useValue:campaigns}],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      const role = req.headers['x-test-role'];
      if (!role) throw new UnauthorizedException();
      req.user = { id: req.headers['x-test-profile']??'test-actor', role };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.init();
  });
  afterAll(async () => { await app?.close(); });
  const routes = [
    { path: '/v1/admin/customers', method: 'get', call: customers.list, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/dealers', method: 'get', call: dealers.list, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/products', method: 'get', call: products.listAdmin, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/product-costs', method: 'get', call: products.listCosts, allowed: ['SUPER_ADMIN'] },
    { path: '/v1/inventory/adjustments', method: 'post', call: inventory.adjust, allowed: ['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE'] },
    { path: '/v1/inventory/reservations', method: 'post', call: inventory.reserve, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/orders', method: 'get', call: orders.list, allowed: ['SUPER_ADMIN', 'ADMIN', 'FINANCE', 'WAREHOUSE'] },
    { path: '/v1/admin/orders/creation-options', method: 'get', call: adminOrders.options, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/orders/00000000-0000-4000-8000-000000000001', method: 'patch', call: adminOrders.update, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/orders/00000000-0000-4000-8000-000000000001/cancel', method: 'post', call: orders.cancel, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/orders/00000000-0000-4000-8000-000000000001/status', method: 'patch', call: orders.updateStatus, allowed: ['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE'] },
    { path: '/v1/admin/warehouse/stock', method: 'get', call: warehouse.listStock, allowed: ['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE'] },
    { path: '/v1/admin/warehouse/locations/00000000-0000-4000-8000-000000000001', method: 'delete', call: warehouse.deleteLocation, allowed: ['SUPER_ADMIN', 'ADMIN'] },
    { path: '/v1/admin/warehouse/receipts', method: 'post', call: warehouse.receiveStock, allowed: ['SUPER_ADMIN', 'ADMIN', 'WAREHOUSE'] },
  ];
  describe.each(routes)('$path', route => {
    it.each([...Object.values(Roles), 'UNKNOWN', undefined])('checks role %s before calling the service', async role => {
      route.call.mockClear();
      const response=await invoke(route.method,route.path,role?{'x-test-role':role}:{});
      const allowed = role !== undefined && route.allowed.includes(role);
      expect(response.status).toBe(!role ? 401 : allowed ? route.method === 'post' ? 201 : 200 : 403);
      expect(route.call).toHaveBeenCalledTimes(allowed ? 1 : 0);
    });
  });
  it('keeps the public product list available without an admin identity', async () => {
    const response = await invoke('GET','/v1/products');
    expect(response.status).toBe(200);
    expect(products.listPublic).toHaveBeenCalledTimes(1);
  });
  const guardedVariants=[
    {path:'/v1/admin/finance/transfers/',method:'post',call:finance.createTransfer,denied:'finance-create',allowed:'finance-approve',body:{}},
    {path:'/V1/ADMIN/FINANCE/TRANSFERS/IDEMPOTENT/',method:'post',call:finance.createTransfer,denied:'finance-create',allowed:'finance-approve',body:{}},
    {path:'/v1/admin/finance/paytr/SETTINGS/',method:'post',call:finance.updatePaytrRate,denied:'finance-create',allowed:'finance-edit',body:{commissionRate:4,expectedCommissionRate:3.69}},
    {path:'/V1/ADMIN/CAMPAIGNS/00000000-0000-4000-8000-000000000001/ACTIVATE/',method:'post',call:campaigns.activate,denied:'campaign-create',allowed:'campaign-approve',body:{expectedStatus:'DRAFT'}},
    {path:'/v1/admin/campaigns/00000000-0000-4000-8000-000000000001/PAUSE/',method:'post',call:campaigns.pause,denied:'campaign-create',allowed:'campaign-approve',body:{expectedStatus:'ACTIVE'}},
    {path:'/V1/ADMIN/ORDERS/00000000-0000-4000-8000-000000000001/STATUS/',method:'patch',call:orders.updateStatus,denied:'order-approve',allowed:'order-shipping-approve',body:{status:'DELIVERED'}},
  ];
  describe.each(guardedVariants)('normalized $path',route=>{
    it('rejects insufficient configured grants before calling a mutation service',async()=>{
      route.call.mockClear();const response=await invoke(route.method,route.path,{'x-test-role':'ADMIN','x-test-profile':route.denied},route.body);
      expect(response.status).toBe(403);expect(route.call).not.toHaveBeenCalled();
    });
    it('allows the explicit matching approval or edit grant',async()=>{
      route.call.mockClear();const response=await invoke(route.method,route.path,{'x-test-role':'ADMIN','x-test-profile':route.allowed},route.body);
      expect(response.status).toBe(route.method==='post'?201:200);expect(route.call).toHaveBeenCalledTimes(1);
    });
  });
});
