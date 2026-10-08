import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles';
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
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomersController, DealersController, ProductsController, InventoryController, OrdersController, WarehouseController],
      providers: [RolesGuard, { provide: CustomersService, useValue: customers },
        { provide: DealersService, useValue: dealers }, { provide: ProductsService, useValue: products },
        { provide: InventoryService, useValue: inventory }, { provide: OrdersService, useValue: orders },
        { provide: AdminOrderService, useValue: adminOrders }, { provide: WarehouseService, useValue: warehouse }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      const role = req.headers['x-test-role'];
      if (!role) throw new UnauthorizedException();
      req.user = { id: 'test-actor', role };
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
    { path: '/v1/admin/product-costs', method: 'get', call: products.listCosts, allowed: ['SUPER_ADMIN', 'ADMIN', 'FINANCE'] },
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
      let req = (request(app.getHttpServer()) as any)[route.method](route.path);
      if (role) req = req.set('x-test-role', role);
      const response = await req;
      const allowed = role !== undefined && route.allowed.includes(role);
      expect(response.status).toBe(!role ? 401 : allowed ? route.method === 'post' ? 201 : 200 : 403);
      expect(route.call).toHaveBeenCalledTimes(allowed ? 1 : 0);
    });
  });
  it('keeps the public product list available without an admin identity', async () => {
    const response = await request(app.getHttpServer()).get('/v1/products');
    expect(response.status).toBe(200);
    expect(products.listPublic).toHaveBeenCalledTimes(1);
  });
});
