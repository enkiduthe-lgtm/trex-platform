type CustomerSearchRow={first_name:string;last_name:string;email:string;phone:string|null};
export function matchesCustomer(customer:CustomerSearchRow,query:string){
 const text=query.trim().toLocaleLowerCase('tr-TR');
 if(!text)return true;
 if([customer.first_name,customer.last_name,customer.email,customer.phone].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR').includes(text))return true;
 const digits=text.replace(/[^0-9]/g,'');
 return digits.length>=3&&/^[+0-9\s().-]+$/.test(text)&&Boolean(customer.phone?.replace(/[^0-9]/g,'').includes(digits));
}
