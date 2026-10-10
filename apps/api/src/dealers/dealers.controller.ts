import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreateDealerDto } from './dto/create-dealer.dto';
import { SetParentDto } from './dto/set-parent.dto';
import { CreateDealerLevelDto } from './dto/create-dealer-level.dto';
import { UpdateDealerStatusDto } from './dto/update-dealer-status.dto';
import { DealersService } from './dealers.service';
import { CreateDealerBankAccountDto, CreateDealerLedgerEntryDto, CreateDealerPriceGroupDto, SetDealerPriceGroupDto } from './dto/dealer-commercial.dto';
type UserRequest = Request & { user: RequestUser };
@Controller('admin/dealers') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class DealersController {
  constructor(private readonly dealers: DealersService) {}
  @Get() list() { return this.dealers.list(); }
  @Get('levels') levels() { return this.dealers.listLevels(); }
  @Get('price-groups') priceGroups() { return this.dealers.listPriceGroups(); }
  @Post('price-groups') createPriceGroup(@Body() dto: CreateDealerPriceGroupDto, @Req() req: UserRequest) { return this.dealers.createPriceGroup(dto, req.user); }
  @Post('levels') level(@Body() dto: CreateDealerLevelDto, @Req() req: UserRequest) { return this.dealers.createLevel(dto, req.user); }
  @Post() create(@Body() dto: CreateDealerDto, @Req() req: UserRequest) { return this.dealers.create(dto, req.user); }
  @Patch(':id/status') status(@Param('id') id: string, @Body() dto: UpdateDealerStatusDto, @Req() req: UserRequest) { return this.dealers.updateStatus(id, dto.status, req.user); }
  @Patch(':id/parent') parent(@Param('id') id: string, @Body() dto: SetParentDto, @Req() req: UserRequest) { return this.dealers.setParent(id, dto.parentDealerId, req.user); }
  @Patch(':id/price-group') priceGroup(@Param('id') id:string,@Body() dto:SetDealerPriceGroupDto,@Req() req:UserRequest) { return this.dealers.setPriceGroup(id,dto.priceGroupId,req.user); }
  @Get(':id/commercial') commercial(@Param('id') id:string) { return this.dealers.commercialSummary(id); }
  @Post(':id/bank-accounts') bankAccount(@Param('id') id:string,@Body() dto:CreateDealerBankAccountDto,@Req() req:UserRequest) { return this.dealers.addBankAccount(id,dto,req.user); }
  @Post(':id/ledger') ledger(@Param('id') id:string,@Body() dto:CreateDealerLedgerEntryDto,@Req() req:UserRequest) { return this.dealers.addLedgerEntry(id,dto,req.user); }
}
