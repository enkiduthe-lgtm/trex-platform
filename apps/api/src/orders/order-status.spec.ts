import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatusUpdate } from './dto/update-order-status.dto';
const actor={id:'actor',role:'ADMIN',email:'test@example.com',sessionId:'session'} as const;
describe('Order status transitions',()=>{
  function setup(status?:string) {
    const query=jest.fn().mockResolvedValue({rows:[]});
    query.mockResolvedValueOnce({rows:status?[{status}]:[]});
    const transaction=jest.fn(async(work:any)=>work({query}));
    return {query,transaction,service:new OrdersService({transaction} as never)};
  }
  it.each(['CANCELLED','DELIVERED','PENDING_PAYMENT','SHIPPED'])('does not reopen %s as processing',async status=>{
    const {service,query}=setup(status);
    await expect(service.updateStatus('order',{status:OrderStatusUpdate.PROCESSING},actor)).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
  });
  it.each([['PAID',OrderStatusUpdate.PROCESSING],['PROCESSING',OrderStatusUpdate.SHIPPED],['SHIPPED',OrderStatusUpdate.DELIVERED]])('allows %s to %s atomically',async(previous,status)=>{
    const {service,query}=setup(previous);
    await expect(service.updateStatus('order',{status},actor)).resolves.toEqual({id:'order',status});
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[2][1]).toEqual(['order',status,actor.id]);
  });
  it('replays an unchanged status without duplicate history',async()=>{
    const {service,query}=setup('PROCESSING');
    await expect(service.updateStatus('order',{status:OrderStatusUpdate.PROCESSING},actor)).resolves.toMatchObject({replayed:true});
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('returns 404 for a missing order',async()=>{
    await expect(setup().service.updateStatus('missing',{status:OrderStatusUpdate.PROCESSING},actor)).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each(['FINANCE','DEALER','CUSTOMER'])('denies %s before opening a transaction',async role=>{
    const {service,transaction}=setup('PAID');
    await expect(service.updateStatus('order',{status:OrderStatusUpdate.PROCESSING},{...actor,role} as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('still delegates cancellation to the stock/payment-safe cancellation flow',async()=>{
    const {service,transaction}=setup();
    const cancel=jest.spyOn(service,'cancel').mockResolvedValue({id:'order',status:'CANCELLED',replayed:true});
    await service.updateStatus('order',{status:OrderStatusUpdate.CANCELLED},actor);
    expect(cancel).toHaveBeenCalledWith('order',actor);
    expect(transaction).not.toHaveBeenCalled();
  });
});
