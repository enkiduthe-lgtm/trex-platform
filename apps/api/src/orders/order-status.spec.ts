import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatusUpdate } from './dto/update-order-status.dto';
const actor={id:'actor',role:'ADMIN',email:'test@example.com',sessionId:'session'} as const;
describe('Order status transitions',()=>{
  function setup(status?:string) {
    const query=jest.fn().mockResolvedValue({rows:[]});
    query.mockResolvedValueOnce({rows:status?[{status}]:[]});
    const shipment = { updateStatus: jest.fn().mockResolvedValue({id:'shipment'}) };
    return {query,shipment,service:new OrdersService({query} as never,shipment as never)};
  }
  it.each(['CANCELLED','DELIVERED','PENDING_PAYMENT','SHIPPED'])('does not reopen %s as processing',async status=>{
    const {service,query}=setup(status);
    await expect(service.updateStatus('order',{status:OrderStatusUpdate.PROCESSING},actor)).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('archived_at IS NULL');
  });
  it.each([[OrderStatusUpdate.SHIPPED,'IN_TRANSIT'],[OrderStatusUpdate.DELIVERED,'DELIVERED']])('routes %s through the shipment workflow',async(status,shipmentStatus)=>{
    const {service,query,shipment}=setup();
    await expect(service.updateStatus('order',{status},actor)).resolves.toEqual({id:'order',status});
    expect(shipment.updateStatus).toHaveBeenCalledWith('order',{status:shipmentStatus},actor.id);
    expect(query).not.toHaveBeenCalled();
  });
  it('replays an unchanged status without duplicate history',async()=>{
    const {service,query}=setup('PROCESSING');
    await expect(service.updateStatus('order',{status:OrderStatusUpdate.PROCESSING},actor)).resolves.toEqual({id:'order',status:'PROCESSING'});
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('returns 404 for a missing order',async()=>{
    await expect(setup().service.updateStatus('missing',{status:OrderStatusUpdate.PROCESSING},actor)).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each(['FINANCE','DEALER','CUSTOMER'])('denies %s before opening a transaction',async role=>{
    const {service,query,shipment}=setup('PAID');
    await expect(service.updateStatus('order',{status:OrderStatusUpdate.PROCESSING},{...actor,role} as never)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
    expect(shipment.updateStatus).not.toHaveBeenCalled();
  });
  it('still delegates cancellation to the stock/payment-safe cancellation flow',async()=>{
    const {service,shipment}=setup();
    const cancel=jest.spyOn(service,'cancel').mockResolvedValue({id:'order',status:'CANCELLED',replayed:true});
    await service.updateStatus('order',{status:OrderStatusUpdate.CANCELLED},actor);
    expect(cancel).toHaveBeenCalledWith('order',actor);
    expect(shipment.updateStatus).not.toHaveBeenCalled();
  });
  it('keeps a missing or unready shipment from changing the order',async()=>{
    const {service,query,shipment}=setup('SHIPPED');
    shipment.updateStatus.mockRejectedValue(new NotFoundException());
    await expect(service.updateStatus('order',{status:OrderStatusUpdate.DELIVERED},actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });
});
