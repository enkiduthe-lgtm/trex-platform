import { createHash } from 'crypto';
type Address = {recipient_name:string;phone:string;city:string;district:string;address_line:string;postal_code:string|null};
type Item = {id:string;quantity:number;unit_amount:string};
export function editVersion(contact: {contact_name:string|null;contact_email:string|null}, address:Address|null,items:Item[]) {
  return createHash('sha256').update(JSON.stringify({name:contact.contact_name,email:contact.contact_email,address:address?[address.recipient_name,address.phone,address.city,address.district,address.address_line,address.postal_code]:null,items:[...items].sort((a,b)=>a.id.localeCompare(b.id)).map(item=>[item.id,item.quantity,item.unit_amount])})).digest('hex');
}
