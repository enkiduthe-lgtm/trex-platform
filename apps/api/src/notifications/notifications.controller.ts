import { Body, Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';
import { NotificationHistoryQueryDto } from './dto/notification-history-query.dto';
import { RequestUser } from '../auth/auth.types';
type UserRequest=Request&{user:RequestUser};
@Controller('admin/notifications') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class NotificationsController {
  constructor(private readonly notifications:NotificationsService){}
  @Get() list(){return this.notifications.list();}
  @Get('configuration') configuration(){return this.notifications.configuration();}
  @Get('history') history(@Query() query:NotificationHistoryQueryDto){return this.notifications.history(query);}
  @Post() send(@Body() dto:CreateNotificationDto,@Req() req:UserRequest){return this.notifications.send(dto,undefined,{actorId:req.user.id});}
  @Post('idempotent') sendIdempotent(@Body() dto:CreateNotificationDto,@Req() req:UserRequest,@Headers('idempotency-key') key?:string){return this.notifications.send(dto,undefined,{actorId:req.user.id,key:key??''});}
  @Post(':id/retry') async retry(@Param('id',new ParseUUIDPipe()) id:string,@Req() req:UserRequest){
    const item=await this.notifications.retry(id,req.user.id);
    if(!item)throw new NotFoundException('Bu bildirim yeniden denemeye uygun değil. Güncel listeyi kontrol edin.');
    return item;
  }
}
