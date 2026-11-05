import {OrdersService} from './orders.service';
describe('Manual sales channel cancellation',()=>{
 function setup(channel:string){const query=jest.fn().mockResolvedValueOnce({rows:[{status:'PENDING_PAYMENT',sales_channel:channel,checkout_id:'c'}]}).mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{status:'SUCCEEDED',provider:'bank_transfer'}]});return {query,service:new OrdersService({transaction:async(work:any)=>work({query})} as never)};}
 it.each(['ADMIN_ORDER','RETAIL','WHOLESALE','INSTAGRAM','DEALER_PORTAL'])('recognizes %s while protecting collected money',async channel=>{const {service}=setup(channel);await expect(service.cancel('o',{id:'director',role:'SUPER_ADMIN'} as never)).rejects.toThrow('Tahsil edilmiş');});
 it.each(['MARKETPLACE','PUBLIC_WEB'])('keeps %s in its integration flow',async channel=>{const {service,query}=setup(channel);await expect(service.cancel('o',{id:'director',role:'SUPER_ADMIN'} as never)).rejects.toThrow('güvenli iptal kapsamı');expect(query).toHaveBeenCalledTimes(1);});
});
