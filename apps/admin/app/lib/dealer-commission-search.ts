export type DealerCommissionFilter='ALL'|'PENDING'|'SETTLED'|'REVERSAL';
type Movement={order_number:string;product_name:string;sku:string;note:string|null;status:string;entry_kind:string};

export function matchesDealerCommission(row:Movement,query:string,filter:DealerCommissionFilter) {
  const reversal=row.entry_kind==='REVERSAL';
  if(filter==='REVERSAL'&&!reversal)return false;
  if(filter==='PENDING'&&(reversal||row.status!=='PENDING'))return false;
  if(filter==='SETTLED'&&(reversal||row.status==='PENDING'))return false;
  const text=[row.order_number,row.product_name,row.sku,row.note??''].join(' ');
  return text.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR'));
}

export const dealerCommissionFilterLabels:Record<DealerCommissionFilter,string>={
  ALL:'Tüm prim hareketleri',PENDING:'Bekleyen primler',SETTLED:'Kesinleşmiş kazançlar',REVERSAL:'İade / iptal ters kayıtları',
};
