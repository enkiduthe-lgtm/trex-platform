import {normalizeDealerDelivery,type DealerDelivery} from './dealer-order-validation';
type SourceAddress={recipient_name:string;phone:string;city:string;district:string;address_line:string;postal_code:string|null};
export type DealerDeliveryCandidate={sourceOrderNumber:string;delivery:DealerDelivery};
export function dealerDeliveryFromAddress(address:SourceAddress|null,dealerEmail:string):DealerDelivery|null {
 if(!address)return null;
 return normalizeDealerDelivery({recipientName:address.recipient_name,phone:address.phone,city:address.city,district:address.district,addressLine:address.address_line,postalCode:address.postal_code??'',contactEmail:dealerEmail});
}
