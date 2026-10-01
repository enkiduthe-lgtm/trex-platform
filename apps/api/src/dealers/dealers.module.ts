import { Module } from '@nestjs/common';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';
import { DealerApplicationsController } from './dealer-applications.controller';
@Module({ controllers: [DealersController, DealerApplicationsController], providers: [DealersService] }) export class DealersModule {}
