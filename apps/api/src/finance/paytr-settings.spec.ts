import {validate} from 'class-validator';
import {UpdatePaytrSettingsDto} from './dto/update-paytr-settings.dto';
import { FinanceService } from './finance.service';
describe('PayTR commission setting',()=>{
 it.each([0,3.69,100])('accepts valid percentage %s',async rate=>{const dto=Object.assign(new UpdatePaytrSettingsDto(),{commissionRate:rate});expect(await validate(dto)).toHaveLength(0)});
 it.each([-1,101,3.699,'3.69',NaN])('rejects invalid percentage %s',async rate=>{const dto=Object.assign(new UpdatePaytrSettingsDto(),{commissionRate:rate});expect((await validate(dto)).length).toBeGreaterThan(0)});
 it.each([-1,101,3.699,'3.69',NaN])('rejects invalid expected percentage %s',async expected=>{const dto=Object.assign(new UpdatePaytrSettingsDto(),{commissionRate:4,expectedCommissionRate:expected});expect((await validate(dto)).some(error=>error.property==='expectedCommissionRate')).toBe(true)});
 it('accepts a valid optional expected percentage',async()=>{const dto=Object.assign(new UpdatePaytrSettingsDto(),{commissionRate:4,expectedCommissionRate:3.69});expect(await validate(dto)).toHaveLength(0)});
});

describe('Guarded PayTR rate updates',()=>{
 const actor={id:'actor',role:'SUPER_ADMIN'} as never;
 function setup(current='3.69'){
  const query=jest.fn().mockResolvedValueOnce({rows:[{commission_rate:current}],rowCount:1}).mockResolvedValue({rows:[],rowCount:1});
  const db={query:jest.fn(),transaction:jest.fn(work=>work({query}))};return {query,db,service:new FinanceService(db as never)};
 }
 it('locks, changes and audits the setting in one transaction',async()=>{
  const s=setup();await expect(s.service.updatePaytrRate(4,actor,3.69)).resolves.toEqual({commissionRate:4,changed:true});expect(s.query.mock.calls[0][0]).toContain('FOR UPDATE');expect(s.query.mock.calls[1][1]).toEqual([4]);expect(s.query.mock.calls[2][0]).toContain('INSERT INTO audit_logs');expect(s.db.query).not.toHaveBeenCalled();
 });
 it('does not audit a repeated request for the already recorded rate',async()=>{
  const s=setup('4.00');await expect(s.service.updatePaytrRate(4,actor,3.69)).resolves.toMatchObject({changed:false});expect(s.query).toHaveBeenCalledTimes(1);
 });
 it('rejects a stale baseline before writing a different rate',async()=>{
  const s=setup('5.00');await expect(s.service.updatePaytrRate(4,actor,3.69)).rejects.toThrow('başka bir işlemde');expect(s.query).toHaveBeenCalledTimes(1);
 });
 it.each([-1,101,3.699,NaN,Infinity])('rejects invalid service input %s without a transaction',async rate=>{
  const s=setup();await expect(s.service.updatePaytrRate(rate,actor)).rejects.toThrow('iki ondalık');expect(s.db.transaction).not.toHaveBeenCalled();
 });
 it('refuses a missing setting instead of silently writing a default',async()=>{
  const s=setup();s.query.mockReset().mockResolvedValue({rows:[],rowCount:0});await expect(s.service.updatePaytrRate(4,actor,3.69)).rejects.toThrow('bulunamadı');expect(s.query).toHaveBeenCalledTimes(1);
 });
});
