import {validate} from 'class-validator';
import {UpdatePaytrSettingsDto} from './dto/update-paytr-settings.dto';
describe('PayTR commission setting',()=>{
 it.each([0,3.69,100])('accepts valid percentage %s',async rate=>{const dto=Object.assign(new UpdatePaytrSettingsDto(),{commissionRate:rate});expect(await validate(dto)).toHaveLength(0)});
 it.each([-1,101,3.699,'3.69',NaN])('rejects invalid percentage %s',async rate=>{const dto=Object.assign(new UpdatePaytrSettingsDto(),{commissionRate:rate});expect((await validate(dto)).length).toBeGreaterThan(0)});
});
