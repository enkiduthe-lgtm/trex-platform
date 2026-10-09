import { Module } from '@nestjs/common';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { CommissionsModule } from '../commissions/commissions.module';
@Module({ imports: [CommissionsModule], controllers: [ReturnsController], providers: [ReturnsService] }) export class ReturnsModule {}
