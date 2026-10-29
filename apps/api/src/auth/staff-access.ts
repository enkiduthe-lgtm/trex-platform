export const accessResources=[
 ['ORDERS','Siparişler'],['PRODUCTS','Ürünler'],['PRICES','Ürün Ve Seviye Fiyatları'],['STOCK','Stok Ve Envanter'],['SHIPPING','Kargo İşlemleri'],['RETURNS','İadeler'],['FINANCE','Finans Ve Havaleler'],['DEALERS','Bayiler Ve Başvurular'],['CUSTOMERS','Müşteriler'],['CURRENT','Cari Hesap'],['COMMISSIONS','Kendi Prim Hakedişleri Ve Bayi Prim İşlemleri'],['REPORTS','Raporlar'],['CAMPAIGNS','Kampanyalar'],['MARKETPLACE','Pazaryeri'],['CONTENT','Tasarım Ve İçerikler'],['SUPPORT','Destek Talepleri'],['NOTIFICATIONS','Bildirimler']
] as const;
export const accessActions=[['VIEW','Görüntüle'],['CREATE','Yeni Kayıt'],['EDIT','Düzenle'],['APPROVE','Onayla / Reddet'],['DELETE','Sil']] as const;
export const accessKeys=accessResources.flatMap(([resource])=>accessActions.map(([action])=>`${resource}.${action}`));
export function requestAccess(path:string,method:string):string|null {
 const p=path.replace(/^\/v1(?=\/)/,'').split('?')[0];
 let resource:string|undefined;
 if(/^\/admin\/(staff|access|settings|audit-logs)(\/|$)/.test(p))return null;
 if(/^\/admin\/orders\/(report|sales-report|special-report)/.test(p)||/^\/admin\/dealers\/sales-report/.test(p))resource='REPORTS';
 else if(/^\/admin\/orders\/.*(shipment|shipping)|^\/admin\/orders\/shipments/.test(p))resource='SHIPPING';
 else if(p.startsWith('/returns/'))resource='RETURNS';
 else if(p.startsWith('/inventory'))resource='STOCK';
 else {
  const section=p.split('/')[2];
  resource=({orders:'ORDERS',products:'PRODUCTS',assets:'PRODUCTS',catalog:'PRODUCTS',prices:'PRICES','product-costs':'PRICES','product-profitability':'REPORTS',warehouse:'STOCK',finance:'FINANCE',dealers:'DEALERS',customers:'CUSTOMERS','current-accounts':'CURRENT',commissions:'COMMISSIONS','dealer-payouts':'COMMISSIONS',campaigns:'CAMPAIGNS',marketplace:'MARKETPLACE',content:'CONTENT',contents:'CONTENT',pages:'CONTENT','legal-documents':'CONTENT',notifications:'NOTIFICATIONS','support-tickets':'SUPPORT'} as Record<string,string>)[section];
 }
 if(!resource)return null;
 let action='VIEW';
 if(method==='DELETE')action='DELETE';
 else if(!['GET','HEAD','OPTIONS'].includes(method)) {
  if(/\/(approve|reject|review|finalize|pay|paid|decision|refund|issue|mark-paid|receive|inspection)(\/|$)/.test(p)||/\/status$/.test(p)||p==='/admin/finance/transfers')action='APPROVE';
  else if(['PATCH','PUT'].includes(method)||/\/(cancel|prepare|pack|publish|deactivate|level|parent|price-group|bulk-status|complete|scan|revisions|queue)(\/|$)/.test(p))action='EDIT';
  else action='CREATE';
 }
 return `${resource}.${action}`;
}
