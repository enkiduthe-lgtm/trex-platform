import {orderQueueStatus} from './order-queue';
const stages=[['PENDING_PAYMENT','Onay Bekliyor'],['PAID','Onaylandı'],['PROCESSING','Hazırlanıyor'],['REGISTERED','Kargo Kaydı Hazır'],['SHIPPED','Kargoda'],['DELIVERED','Teslim Edildi'],['CARRIER_RETURN','Kargo İadeleri'],['REFUNDED','İade Edildi'],['CANCELLED','İptal Edildi']] as const;
export function dashboardOrderSummary(orders:Parameters<typeof orderQueueStatus>[0][]) {
 return stages.map(([stage,label])=>({label,value:orders.filter(order=>orderQueueStatus(order)===stage).length,href:'/siparisler?durum='+stage}));
}
