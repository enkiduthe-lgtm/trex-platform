import { Module } from '@nestjs/common';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { StaffChannelService } from './staff-channel.service';
@Module({ controllers: [CommissionsController], providers: [CommissionsService,StaffChannelService], exports: [CommissionsService] }) export class CommissionsModule {}
