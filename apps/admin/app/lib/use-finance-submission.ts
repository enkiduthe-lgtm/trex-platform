'use client';
import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './api';

type Intent={body:string;key:string;endpoint:string};
type Receipt={id?:string;transferGroupId?:string;replayed?:boolean};
export function useFinanceSubmission(endpoint='/admin/finance/transactions/idempotent',receiptField:'id'|'transferGroupId'='id',label='Para hareketi'){
 const intent=useRef<Intent|null>(null),lock=useRef(false),alive=useRef(true);
 const [pending,setPending]=useState<Intent|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function perform(body:string,recover=false){
  if(!alive.current||lock.current)throw new Error(`${label} için işlem zaten devam ediyor.`);
  if(intent.current&&(intent.current.body!==body||!recover&&intent.current.endpoint!==endpoint))throw new Error(`Önce sonucu doğrulanamayan ${label.toLocaleLowerCase('tr-TR')} kaydını kontrol edin.`);
  lock.current=true;if(alive.current)setBusy(true);
  let attempt:Intent|null=null;
  try{
   if(!alive.current)throw new Error('Ekran kapatıldı. Yeni işlem gönderilmedi.');
   attempt=intent.current??{body,key:crypto.randomUUID(),endpoint};intent.current=attempt;
   const result=await api<Receipt>(attempt.endpoint,{method:'POST',headers:{'Idempotency-Key':attempt.key},body:attempt.body});
   if(!result||typeof result[receiptField]!=='string'||!result[receiptField])throw new Error(`${label} yanıtı doğrulanamadı. Aynı işlemi yeniden kontrol edin.`);
   intent.current=null;if(alive.current)setPending(null);return result;
  }catch(error){
   const rejected=error instanceof ApiError&&error.status>=400&&error.status<500&&![408,429,499].includes(error.status);
   if(rejected){intent.current=null;if(alive.current)setPending(null);}
   else if(attempt&&alive.current)setPending(attempt);
   throw error;
  }finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function retry(){if(!intent.current)throw new Error(`Kontrol edilecek ${label.toLocaleLowerCase('tr-TR')} bulunmuyor.`);return perform(intent.current.body,true);}
 return {send:(body:string)=>perform(body),retry,pending,busy};
}

export function validFinanceAmount(value:string){
 if(!/^\d+(?:\.\d{1,2})?$/.test(value))return false;
 const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return amount>0n&&amount<=999999999999n;
}
