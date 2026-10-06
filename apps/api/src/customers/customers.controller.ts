import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; import { RolesGuard } from '../auth/roles.guard'; import { RequireRoles } from '../auth/roles.decorator'; import { Roles } from '../auth/roles'; import { RequestUser } from '../auth/auth.types'; import { CustomersService } from './customers.service';
class NoteDto{@IsString()@MaxLength(5000)body!:string} type UserRequest=Request&{user:RequestUser};
@Controller('admin/customers')@UseGuards(JwtAuthGuard,RolesGuard)@RequireRoles(Roles.SUPER_ADMIN,Roles.ADMIN)
export class CustomersController{constructor(private readonly customers:CustomersService){}@Get()list(){return this.customers.list()}@Get(':id/notes')notes(@Param('id')id:string){return this.customers.notes(id)}@Post(':id/notes')add(@Param('id')id:string,@Body()dto:NoteDto,@Req()req:UserRequest){return this.customers.addNote(id,dto.body,req.user.id)}}
