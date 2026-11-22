import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { RolesGuard } from '../auth/roles.guard';
import { requestAccess } from '../auth/staff-access';

describe('Aggregate registration report',()=>{
  it('returns only daily counts and an explicit period',async()=>{
    const query=jest.fn().mockResolvedValue({rows:[{day:'2026-11-22',count:3,active:2},{day:'2026-11-21',count:1,active:0}]}),service=new CustomersService({query} as never);
    const result=await service.registrationReport('2026-11-21','2026-11-22');
    expect(result).toMatchObject({dateFrom:'2026-11-21',dateTo:'2026-11-22',count:4,active:2});
    expect(query.mock.calls[0][1]).toEqual(['2026-11-21','2026-11-22']);
    expect(query.mock.calls[0][0]).toContain("AT TIME ZONE 'Europe/Istanbul'");
    expect(query.mock.calls[0][0]).not.toMatch(/email|phone|first_name|last_name/);
  });
  it.each([['2026-02-30',''],['2026-11-23','2026-11-22'],['0000-01-01',''],['not-date','']])('rejects %s to %s before SQL',async(from,to)=>{
    const query=jest.fn();await expect(new CustomersService({query} as never).registrationReport(from,to)).rejects.toMatchObject({status:400});expect(query).not.toHaveBeenCalled();
  });
  it('keeps the reports grant separate from full customer-card access',async()=>{
    const query=jest.fn().mockResolvedValue({rowCount:1,rows:[{grants:['REPORTS.VIEW']}]}),guard=new RolesGuard(new Reflector(),{query} as never);
    const context=(path:string,handler:unknown)=>({getClass:()=>CustomersController,getHandler:()=>handler,switchToHttp:()=>({getRequest:()=>({path,method:'GET',user:{id:'staff',role:'ADMIN'}})})}) as never;
    await expect(guard.canActivate(context('/v1/admin/customers/registration-report/',CustomersController.prototype.registrationReport))).resolves.toBe(true);
    await expect(guard.canActivate(context('/v1/admin/customers',CustomersController.prototype.list))).rejects.toThrow('Yetki Verilmemiş');
    query.mockResolvedValue({rowCount:1,rows:[{grants:['CUSTOMERS.VIEW']}]});
    await expect(guard.canActivate(context('/v1/admin/customers/registration-report',CustomersController.prototype.registrationReport))).rejects.toThrow('Yetki Verilmemiş');
  });
  it.each(['/admin/customers/registration-report','/V1/ADMIN/CUSTOMERS/REGISTRATION-REPORT/'])('normalizes the exact aggregate route %s',path=>{
    expect(requestAccess(path,'get')).toBe('REPORTS.VIEW');
    expect(requestAccess(path+'/other','GET')).toBe('CUSTOMERS.VIEW');
  });
});
