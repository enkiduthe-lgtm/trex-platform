type Delivery={customerId:string;city:string;district:string;addressLine:string;postalCode:string};
export function customerDeliveryFields(current:Delivery,nextCustomerId:string) {
 return current.customerId===nextCustomerId?{city:current.city,district:current.district,addressLine:current.addressLine,postalCode:current.postalCode}:{city:'',district:'',addressLine:'',postalCode:''};
}
