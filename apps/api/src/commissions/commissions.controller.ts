import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { CommissionsService } from './commissions.service';
@Controller('admin/commissions') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE)
export class CommissionsController { constructor(private readonly commissions: CommissionsService) {} @Post('rules') createRule(@Body() dto: CreateCommissionRuleDto) { return this.commissions.createRule(dto); } @Post('entries/:id/reverse') reverse(@Param('id') id: string) { return this.commissions.reverse(id); } }
