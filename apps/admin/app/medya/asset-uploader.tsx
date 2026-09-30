'use client';
import { ChangeEvent, useState } from 'react';
const slots=[
  {name:'Ana sayfa büyük banner',width:1920,height:720,maxKb:500,formats:['image/webp','image/jpeg']},
  {name:'Mobil ana sayfa banner',width:1080,height:1350,maxKb:400,formats:['image/webp','image/jpeg']},
  {name:'Ürün ana görseli',width:1600,height:1600,maxKb:350,formats:['image/webp','image/jpeg']},
  {name:'Ürün ek görseli',width:1200,height:1200,maxKb:300,formats:['image/webp','image/jpeg']},
  {name:'Kategori görseli',width:1200,height:800,maxKb:350,formats:['image/webp','image/jpeg']},
  {name:'Blog kapak görseli',width:1600,height:900,maxKb:400,formats:['image/webp','image/jpeg']},
  {name:'Site logosu',width:512,height:512,maxKb:200,formats:['image/svg+xml','image/png']},
  {name:'Favicon',width:64,height:64,maxKb:50,formats:['image/svg+xml','image/png']},
  {name:'Sosyal paylaşım görseli',width:1200,height:630,maxKb:500,formats:['image/jpeg','image/png']},
];
function dimensions(file:File){return new Promise<{width:number;height:number}>((resolve,reject)=>{const image=new Image();const url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);resolve({width:image.width,height:image.height})};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Görsel okunamadı'))};image.src=url})}
export function AssetUploader(){
  const[index,setIndex]=useState(0); const [result,setResult]=useState<string>(''); const slot=slots[index];
  async function inspect(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;const issues:string[]=[];if(!slot.formats.includes(file.type))issues.push('Dosya türü bu alan için uygun değil.');if(file.size>slot.maxKb*1024)issues.push(`Dosya ${slot.maxKb} KB sınırını aşıyor.`);if(file.type!=='image/svg+xml'){try{const size=await dimensions(file);if(size.width!==slot.width||size.height!==slot.height)issues.push(`Ölçü ${size.width} × ${size.height}; gerekli ölçü ${slot.width} × ${slot.height}.`)}catch{issues.push('Görsel ölçüsü okunamadı.')}}setResult(issues.length?`Düzeltilecekler: ${issues.join(' ')}`:'Hazır: dosya bu alanın ölçü, tür ve boyut kurallarını karşılıyor.');}
  return <article style={{marginBottom:'2rem'}}><h2>Görsel yükle</h2><label>Kullanım alanı<select value={index} onChange={e=>{setIndex(Number(e.target.value));setResult('')}}>{slots.map((s,i)=><option key={s.name} value={i}>{s.name}</option>)}</select></label><strong style={{display:'block',marginTop:'1rem'}}>Hazırlanacak ölçü: {slot.width} × {slot.height} px</strong><p>{slot.formats.map(value=>value.replace('image/','').toUpperCase()).join(' veya ')} · en fazla {slot.maxKb} KB</p><input type="file" accept={slot.formats.join(',')} onChange={inspect}/>{result&&<p role="status"><strong>{result}</strong></p>}<p>Kontrol tamamlandıktan sonra gerçek dosya, depolama bağlantısı açıldığında burada güvenli olarak kaydedilecek.</p></article>}
