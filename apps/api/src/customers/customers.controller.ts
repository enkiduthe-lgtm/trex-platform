import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RequestUser } from '../auth/auth.types';
import { CustomersService } from './customers.service';

class NoteDto { @IsString() @MaxLength(5000) body!: string; }
class LoyaltyAdjustmentDto { @IsInt() @Min(-100000) @Max(100000) points!: number; @IsString() @MaxLength(500) reason!: string; }
class CustomerRequestDto { @IsString() @MaxLength(180) subject!: string; @IsString() @MaxLength(5000) body!: string; @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority!: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; }
class CustomerRequestStatusDto { @IsIn(['OPEN','IN_PROGRESS','RESOLVED','CLOSED']) status!: 'OPEN'|'IN_PROGRESS'|'RESOLVED'|'CLOSED'; @IsOptional() @IsString() @MaxLength(2000) resolutionNote?: string; }
type UserRequest = Request & { user: RequestUser };

@Controller('admin/customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list() { return this.customers.list(); }
  @Get(':id/notes') notes(@Param('id') id: string) { return this.customers.notes(id); }
  @Post(':id/notes') add(@Param('id') id: string, @Body() dto: NoteDto, @Req() req: UserRequest) { return this.customers.addNote(id, dto.body, req.user.id); }
  @Get(':id/loyalty') loyalty(@Param('id') id: string) { return this.customers.loyalty(id); }
  @Post(':id/loyalty/adjust') adjustLoyalty(@Param('id') id: string, @Body() dto: LoyaltyAdjustmentDto, @Req() req: UserRequest) { return this.customers.adjustLoyalty(id, dto, req.user.id); }
  @Get(':id/requests') requests(@Param('id') id: string) { return this.customers.requests(id); }
  @Post(':id/requests') createRequest(@Param('id') id: string, @Body() dto: CustomerRequestDto, @Req() req: UserRequest) { return this.customers.createRequest(id, dto, req.user.id); }
  @Patch(':id/requests/:requestId') updateRequest(@Param('id') id: string, @Param('requestId') requestId: string, @Body() dto: CustomerRequestStatusDto, @Req() req: UserRequest) { return this.customers.updateRequest(id, requestId, dto, req.user.id); }
}
