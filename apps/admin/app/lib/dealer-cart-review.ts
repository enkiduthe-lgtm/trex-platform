import {validDealerMoney} from './dealer-order-validation';
type Line={productId:string;currency:string;quantity:number;baseAmount:string;packSize?:number};
type Product={id:string;amount:string|null;currency:string|null;available_quantity?:number;packs?:{size:number;amount:string}[]};
export type DealerCartIssue={kind:'UNAVAILABLE'|'CURRENCY'|'PRICE'|'STOCK';message:string};
const cents=(amount:string)=>{const [whole,fraction='']=amount.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));};
export function dealerCartIssue(line:Line,product:Product|undefined):DealerCartIssue|null {
 if(!product||product.amount===null||!product.currency)return {kind:'UNAVAILABLE',message:'Ürün veya tekli seviye fiyatı artık kullanılamıyor. Satırı çıkarın ya da fiyat tanımı için yöneticiye başvurun.'};
 if(product.currency!==line.currency)return {kind:'CURRENCY',message:'Ürünün fiyat para birimi değişti. Satırı çıkarıp doğru para birimiyle yeniden ekleyin.'};
 const floor=line.packSize?product.packs?.find(pack=>pack.size===line.packSize)?.amount:product.amount;
 if(floor===undefined||!validDealerMoney(floor)||!validDealerMoney(line.baseAmount))return {kind:'UNAVAILABLE',message:'Bu alım seçeneğinin seviye fiyatı kullanılamıyor. Satırı düzenleyip geçerli bir alım seçeneği belirleyin.'};
 if(cents(floor)!==cents(line.baseAmount))return {kind:'PRICE',message:'Seviye alım fiyatı güncellenmiş. Düzenle ile satış fiyatını kontrol edip değişikliği kaydedin.'};
 if(product.available_quantity!==undefined&&line.quantity>product.available_quantity)return {kind:'STOCK',message:`Stokta ${product.available_quantity} adet var. Sipariş adedini azaltın veya satırı çıkarın.`};
 return null;
}
