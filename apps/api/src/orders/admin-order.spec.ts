import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminOrderService } from './admin-order.service';
import { CreateAdminOrderDto } from './dto/create-admin-order.dto';
import { OrdersController } from './orders.controller';
import { RolesGuard } from '../auth/roles.guard';

const dto = { warehouseId:'f61db1b6-5bd6-4c68-9564-e063d34e1f68',recipientName:'Test',contactEmail:'test@example.com',phone:'05000000000',city:'İstanbul',district:'Test',addressLine:'Test address',paymentMethod:'TRANSFER',items:[{productId:'d91db1b6-5bd6-4c68-9564-e063d34e1f68',quantity:2}] };
describe('Administrator order input and access', () => {
  it('accepts a complete order', async () => {
    expect(await validate(plainToInstance(CreateAdminOrderDto,dto))).toHaveLength(0);
  });
  it.each([0,-1,1.5,100001])('rejects invalid quantity %s',async quantity => {
    expect((await validate(plainToInstance(CreateAdminOrderDto,{...dto,items:[{...dto.items[0],quantity}]}))).length).toBeGreaterThan(0);
  });
  it('does not permit forged paid status or unknown price fields',async () => {
    expect((await validate(plainToInstance(CreateAdminOrderDto,{...dto,status:'PAID',items:[{...dto.items[0],unitAmount:0}]}),{whitelist:true,forbidNonWhitelisted:true})).length).toBeGreaterThan(0);
  });
  it.each(['ADMIN','SUPER_ADMIN'])('allows %s to create orders',role => {
    const guard = new RolesGuard(new Reflector());
    const context:any = { getHandler:()=>OrdersController.prototype.create,getClass:()=>OrdersController,switchToHttp:()=>({getRequest:()=>({user:{role}})}) };
    expect(guard.canActivate(context)).toBe(true);
  });
  it.each(['WAREHOUSE','FINANCE','DEALER','CUSTOMER',undefined])('blocks %s from order entry',role => {
    const guard = new RolesGuard(new Reflector());
    for(const handler of [OrdersController.prototype.create,OrdersController.prototype.options,OrdersController.prototype.prices,OrdersController.prototype.cancel]) {
      const context:any = { getHandler:()=>handler,getClass:()=>OrdersController,switchToHttp:()=>({getRequest:()=>({user:role?{role}:undefined})}) };
      expect(()=>guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });
  it('rejects duplicate product lines without touching stock',async () => {
    const db = { transaction:jest.fn() };
    const service = new AdminOrderService(db as never);
    await expect(service.create({...dto,items:[dto.items[0],dto.items[0]]} as CreateAdminOrderDto,'f61db1b6-5bd6-4c68-9564-e063d34e1f68',{} as never)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each(['TRANSFER','COD_CARD','COD_CASH','HAND_CASH'])('accepts %s and a manager price override',async paymentMethod=>{
    expect(await validate(plainToInstance(CreateAdminOrderDto,{...dto,paymentMethod,priceChangeReason:'Approved discount',items:[{...dto.items[0],unitAmount:500.25}]}))).toHaveLength(0);
  });
  it.each([null,-1,1.001,10000000000])('rejects invalid custom price %s',async unitAmount=>{
    expect((await validate(plainToInstance(CreateAdminOrderDto,{...dto,items:[{...dto.items[0],unitAmount}]}))).length).toBeGreaterThan(0);
  });
  it.each(['TRY','EUR','USD'])('accepts currency %s',async currency=>{
    expect(await validate(plainToInstance(CreateAdminOrderDto,{...dto,currency}))).toHaveLength(0);
  });
  it.each([null,'GBP',''])('rejects invalid currency %s',async currency=>{
    expect((await validate(plainToInstance(CreateAdminOrderDto,{...dto,currency}))).length).toBeGreaterThan(0);
  });
  it('rejects a price override without a reason before touching stock',async()=>{
    const db={transaction:jest.fn()};
    await expect(new AdminOrderService(db as never).create({...dto,items:[{...dto.items[0],unitAmount:500}]} as CreateAdminOrderDto,'f61db1b6-5bd6-4c68-9564-e063d34e1f68',{} as never)).rejects.toThrow('değişiklik nedeni');
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
