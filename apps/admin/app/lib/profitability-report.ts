export type ProfitabilityRow={id:string;name:string;sale_price:string|null;sale_currency:string|null;unit_cost:string|null;cost_currency:string|null;gross_profit:string|null;gross_margin_percent:string|null};
export type ProfitabilityFilter='ALL'|'NO_COST'|'NO_PRICE'|'MIXED'|'LOSS'|'LOW_MARGIN'|'PROFITABLE';
const numeric=(value:unknown)=>value===null||typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)&&Number.isFinite(Number(value));
const currency=(value:unknown)=>value===null||typeof value==='string'&&/^[A-Z]{3}$/.test(value);
export function validateProfitability(value:unknown):ProfitabilityRow[]{
  if(!Array.isArray(value)||new Set(value.map(row=>row?.id)).size!==value.length||value.some(row=>{
    if(!row||typeof row.id!=='string'||!row.id||typeof row.name!=='string'||![row.sale_price,row.unit_cost,row.gross_profit,row.gross_margin_percent].every(numeric)||!currency(row.sale_currency)||!currency(row.cost_currency))return true;
    if((row.sale_price===null)!==(row.sale_currency===null)||(row.unit_cost===null)!==(row.cost_currency===null))return true;
    const comparable=row.sale_price!==null&&row.unit_cost!==null&&row.sale_currency===row.cost_currency;
    return comparable?row.gross_profit===null||(Number(row.sale_price)>0)===(row.gross_margin_percent===null):row.gross_profit!==null||row.gross_margin_percent!==null;
  }))throw new Error('Ürün kârlılığı kayıtları doğrulanamadı.');
  return value as ProfitabilityRow[];
}
export function profitabilityStatus(row:ProfitabilityRow){
  if(row.sale_price===null)return 'Satış Fiyatı Eksik';
  if(row.unit_cost===null)return 'Maliyet Eksik';
  if(row.sale_currency!==row.cost_currency)return 'Para Birimleri Farklı';
  if(row.gross_profit!==null&&Number(row.gross_profit)<0)return 'Birim Satış Zararı';
  if(Number(row.sale_price)===0)return 'Sıfır Satış Fiyatı';
  return row.gross_margin_percent!==null&&Number(row.gross_margin_percent)>=20?'Marj %20 Ve Üzeri':'Marj %20 Altı';
}
export function filterProfitability(rows:ProfitabilityRow[],query:string,filter:ProfitabilityFilter){
  const term=query.trim().toLocaleLowerCase('tr-TR');
  return rows.filter(row=>{
    if(!row.name.toLocaleLowerCase('tr-TR').includes(term))return false;
    const margin=row.gross_margin_percent===null?null:Number(row.gross_margin_percent);
    return filter==='ALL'||filter==='NO_COST'&&row.unit_cost===null||filter==='NO_PRICE'&&row.sale_price===null||filter==='MIXED'&&row.sale_currency!==null&&row.cost_currency!==null&&row.sale_currency!==row.cost_currency||filter==='LOSS'&&row.gross_profit!==null&&Number(row.gross_profit)<0||filter==='LOW_MARGIN'&&margin!==null&&margin>=0&&margin<20||filter==='PROFITABLE'&&margin!==null&&margin>=20;
  });
}
