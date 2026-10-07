import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAdminOrderDto } from './dto/update-admin-order.dto';
import { editVersion } from './edit-version';

const dto={version:'a'.repeat(64),reason:'Correction',recipientName:'Test User',contactEmail:'test@example.com',phone:'05000000000',city:'Test',district:'Test',addressLine:'Test address',postalCode:'',items:[{itemId:'d91db1b6-5bd6-4c68-9564-e063d34e1f68',quantity:2,unitAmount:20.25}]};
describe('Order edit validation',()=>{
  it('accepts a complete edit',async()=>expect(await validate(plainToInstance(UpdateAdminOrderDto,dto))).toHaveLength(0));
  it.each([0,-1,1.5,100001,null])('rejects quantity %s',async quantity=>expect((await validate(plainToInstance(UpdateAdminOrderDto,{...dto,items:[{...dto.items[0],quantity}]}))).length).toBeGreaterThan(0));
  it.each([-1,1.001,10000000000,null])('rejects unit price %s',async unitAmount=>expect((await validate(plainToInstance(UpdateAdminOrderDto,{...dto,items:[{...dto.items[0],unitAmount}]}))).length).toBeGreaterThan(0));
  it.each(['currency','paymentMethod','warehouseId','status'])('rejects forged %s',async field=>expect((await validate(plainToInstance(UpdateAdminOrderDto,{...dto,[field]:'FORGED'}),{whitelist:true,forbidNonWhitelisted:true})).length).toBeGreaterThan(0));
  it('rejects a missing edit version',async()=>expect((await validate(plainToInstance(UpdateAdminOrderDto,{...dto,version:undefined}))).length).toBeGreaterThan(0));
  it('versions detect quantity, price and address changes',()=>{
    const contact={contact_name:'Test',contact_email:'test@example.com'},address={recipient_name:'Test',phone:'0500',city:'Test',district:'Test',address_line:'Address',postal_code:null};
    const items=[{id:'line',quantity:1,unit_amount:'20.25'}],version=editVersion(contact,address,items);
    expect(editVersion(contact,{...address,address_line:'New address'},items)).not.toBe(version);
    expect(editVersion(contact,address,[{...items[0],quantity:2}])).not.toBe(version);
    expect(editVersion(contact,address,[{...items[0],unit_amount:'25.00'}])).not.toBe(version);
  });
});
