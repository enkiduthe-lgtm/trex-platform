import {orderQueueStatus} from './order-queue';
const stages=[['PENDING_PAYMENT','Onay Bekliyor'],['PAID','Onaylandı'],['PROCESSING','Hazırlanıyor'],['REGISTERED','Kargo Kaydı Hazır'],['SHIPPED','Kargoda'],['DELIVERED','Teslim Edildi'],['REFUNDED','İade Edildi'],['CANCELLED','İptal Edildi']] as const;
export function dashboardOrderSummary(orders:{status:string;shipment_status?:string|null}[]) {
 return stages.map(([stage,label])=>({label,value:orders.filter(order=>orderQueueStatus(order)===stage).length,href:'/siparisler?durum='+stage}));
}
