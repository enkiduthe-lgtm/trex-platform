export const deliveryFieldNames=['recipientName','contactEmail','phone','city','district','postalCode','addressLine'] as const;
export type DealerDeliveryField=typeof deliveryFieldNames[number];
export type DealerDelivery=Record<DealerDeliveryField,string>;
export type DealerDeliveryErrors=Partial<Record<DealerDeliveryField,string>>;
export const deliveryFieldRules:Record<DealerDeliveryField,{label:string;maxLength:number;autoComplete:string}>={
 recipientName:{label:'Alıcı Adı',maxLength:160,autoComplete:'shipping name'},
 contactEmail:{label:'E-Posta',maxLength:254,autoComplete:'shipping email'},
 phone:{label:'Telefon',maxLength:40,autoComplete:'shipping tel'},
 city:{label:'İl',maxLength:100,autoComplete:'shipping address-level1'},
 district:{label:'İlçe',maxLength:100,autoComplete:'shipping address-level2'},
 postalCode:{label:'Posta Kodu',maxLength:20,autoComplete:'shipping postal-code'},
 addressLine:{label:'Açık Adres',maxLength:500,autoComplete:'shipping street-address'},
};
export function normalizeDealerDelivery<T extends DealerDelivery>(delivery:T):T {
 const cleaned={...delivery};
 for(const field of deliveryFieldNames)cleaned[field]=delivery[field].trim();
 cleaned.contactEmail=cleaned.contactEmail.toLowerCase();
 return cleaned;
}
export function dealerDeliveryErrors(delivery:DealerDelivery):DealerDeliveryErrors {
 const errors:DealerDeliveryErrors={};
 for(const field of deliveryFieldNames){
  const value=delivery[field].trim(),rule=deliveryFieldRules[field];
  if(field!=='postalCode'&&!value)errors[field]=`${rule.label} bilgisini girin.`;
  else if(value.length>rule.maxLength)errors[field]=`${rule.label} en fazla ${rule.maxLength} karakter olabilir.`;
 }
 return errors;
}
export function validDealerMoney(value:string) {
 return /^\d+(?:\.\d{1,2})?$/.test(value)&&Number.isFinite(Number(value))&&Number(value)<=9999999999.99;
}
export function dealerCheckoutTotal(products:string,paymentMethod:string,codFee:string) {
 if(!/^\d+(?:\.\d{1,2})?$/.test(products))return null;
 const fee=paymentMethod.startsWith('COD_')?codFee:'0';
 if(!validDealerMoney(fee))return null;
 const cents=(value:string)=>{const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};
 const format=(value:bigint)=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
 const productCents=cents(products),feeCents=cents(fee),total=productCents+feeCents;
 return {products:format(productCents),fee:format(feeCents),total:format(total),positiveProducts:productCents>0n,withinLimit:total<=999999999999n};
}
