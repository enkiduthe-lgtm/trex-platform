import { Module } from '@nestjs/common'; import { CampaignsController } from './campaigns.controller'; import { CampaignsService } from './campaigns.service';
import { CouponsController } from './campaigns.controller';
@Module({ controllers:[CampaignsController,CouponsController], providers:[CampaignsService] }) export class CampaignsModule {}
