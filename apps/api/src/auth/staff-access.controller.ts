import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Put, Req, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn } from 'class-validator';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { RequireRoles } from './roles.decorator';
import { Roles } from './roles';
import { RequestUser } from './auth.types';
import { accessActions, accessKeys, accessResources } from './staff-access';
class AccessDto { @IsArray() @ArrayMaxSize(200) @ArrayUnique() @IsIn(accessKeys,{each:true}) grants!:string[]; }
@Controller('admin/access') @UseGuards(JwtAuthGuard,RolesGuard)
export class StaffAccessController {
 constructor(private readonly db:DatabaseService){}
 @Get('me') @RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN,Roles.FINANCE,Roles.WAREHOUSE)
 async me(@Req() req:Request&{user:RequestUser}){const row=await this.db.query<{grants:string[]}>('SELECT grants FROM staff_access_profiles WHERE user_id=$1',[req.user.id]);return {role:req.user.role,configured:!!row.rowCount,grants:req.user.role==='SUPER_ADMIN'?accessKeys:row.rows[0]?.grants??null};}
 @Get(':id') @RequireRoles(Roles.SUPER_ADMIN)
 async get(@Param('id',new ParseUUIDPipe()) id:string){
  const user=(await this.db.query<{role:string;email:string}>('SELECT role,email FROM users WHERE id=$1',[id])).rows[0];if(!user||!['ADMIN','SUPER_ADMIN','FINANCE','WAREHOUSE'].includes(user.role))throw new BadRequestException('Panel Hesabı Bulunamadı');
  const row=await this.db.query<{grants:string[]}>('SELECT grants FROM staff_access_profiles WHERE user_id=$1',[id]);
  return {user,resources:accessResources,actions:accessActions,configured:!!row.rowCount,grants:row.rows[0]?.grants??accessKeys.filter(k=>!k.startsWith('FINANCE.')&&!k.startsWith('REPORTS.')&&!k.startsWith('PRICES.')&&!k.endsWith('.DELETE'))};
 }
 @Put(':id') @RequireRoles(Roles.SUPER_ADMIN)
 async save(@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:AccessDto,@Req() req:Request&{user:RequestUser}){
  for(const grant of dto.grants){const resource=grant.split('.')[0];if(!dto.grants.includes(`${resource}.VIEW`))throw new BadRequestException('İşlem İzni İçin Önce Aynı Bölümün Görüntüleme İznini İşaretleyin');}
  return this.db.transaction(async client=>{
   const user=await client.query("SELECT id FROM users WHERE id=$1 AND role='ADMIN' FOR UPDATE",[id]);if(!user.rowCount)throw new BadRequestException('Yalnız Yönetici Rolünün Yetkileri Sınırlandırılabilir');
   await client.query('INSERT INTO staff_access_profiles(user_id,grants,updated_by) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET grants=EXCLUDED.grants,updated_by=EXCLUDED.updated_by,updated_at=now()',[id,dto.grants,req.user.id]);
   await client.query("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,'staff.permissions.updated','user',$2,$3)",[req.user.id,id,JSON.stringify({grants:dto.grants})]);return {saved:true};
  });
 }
}
