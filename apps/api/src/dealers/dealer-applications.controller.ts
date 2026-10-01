import { Body, Controller, Post } from '@nestjs/common';
import { DealersService } from './dealers.service';
import { PublicDealerApplicationDto } from './dto/public-dealer-application.dto';
@Controller('dealer-applications') export class DealerApplicationsController { constructor(private readonly dealers: DealersService) {} @Post() create(@Body() dto: PublicDealerApplicationDto) { return this.dealers.createPublicApplication(dto); } }
