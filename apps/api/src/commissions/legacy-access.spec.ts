import { CommissionsService } from './commissions.service';
import { ForbiddenException } from '@nestjs/common';
describe('Legacy commission mutation access',()=>{
 it.each(['ADMIN','DEALER','FINANCE','WAREHOUSE'])('blocks %s before all legacy mutations',async role=>{
  const db={query:jest.fn(),transaction:jest.fn()};const service=new CommissionsService(db as never);const actor={id:'u',email:'user@example.com',sessionId:'s',role} as never;
  for(const action of [()=>service.createRule({} as never,actor),()=>service.createStaffRule({} as never,actor),()=>service.deactivateRule('id',actor),()=>service.finalize('id',actor),()=>service.pay('id',{} as never,actor),()=>service.reverse('id',{} as never,actor)])await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.query).not.toHaveBeenCalled();expect(db.transaction).not.toHaveBeenCalled();
 });
});
