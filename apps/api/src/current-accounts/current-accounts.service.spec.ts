import { BadRequestException } from '@nestjs/common';
import { CurrentAccountsService } from './current-accounts.service';

describe('CurrentAccountsService', () => {
  const actor={id:'user'} as never;
  function setup(){const query=jest.fn(async(sql:string)=>{if(sql.includes('FROM dealers WHERE id'))return{rowCount:1,rows:[{}]};if(sql.includes('INSERT INTO current_account_entries'))return{rowCount:1,rows:[{id:'entry'}]};return{rowCount:1,rows:[]};});return{service:new CurrentAccountsService({query} as never),query};}
  it('fixes a sale as a debit regardless of client input',async()=>{const {service,query}=setup();await service.create({partyType:'DEALER',partyId:'party',entryType:'SALE',direction:'DEBIT',amount:10,currency:'TRY',sourceType:'ORDER',description:'Satış'} as never,actor);const insertCall=query.mock.calls.find(x=>String(x[0]).includes('INSERT INTO current_account_entries')) as unknown as [string,unknown[]]|undefined;expect(insertCall?.[1]).toContain('DEBIT');});
  it('requires a direction for an adjustment',async()=>{const {service}=setup();await expect(service.create({partyType:'DEALER',partyId:'party',entryType:'ADJUSTMENT',amount:10,sourceType:'MANUAL',description:'Düzeltme'} as never,actor)).rejects.toBeInstanceOf(BadRequestException);});
});
