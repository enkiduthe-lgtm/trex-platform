import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireRoles } from '../auth/roles.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportProductsDto } from './dto/import-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';
import { CreateProductCostDto } from './dto/create-product-cost.dto';
type UserRequest = Request & { user: RequestUser };
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  @Get('products') listPublic() { return this.products.listPublic(); }
  @Get('products/:slug') getPublic(@Param('slug') slug: string) { return this.products.getPublic(slug); }
  @Get('admin/products') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) listAdmin() { return this.products.listAdmin(); }
  @Get('admin/product-costs') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE) listCosts() { return this.products.listCosts(); }
  @Get('admin/product-profitability') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE) profitability() { return this.products.profitability(); }
  @Post('admin/product-costs') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN, Roles.FINANCE) createCost(@Body() dto: CreateProductCostDto, @Req() req: UserRequest) { return this.products.createCost(dto, req.user); }
  @Post('admin/products') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) create(@Body() dto: CreateProductDto, @Req() req: UserRequest) { return this.products.create(dto, req.user); }
  @Post('admin/products/import') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) importMany(@Body() dto: ImportProductsDto, @Req() req: UserRequest) { return this.products.importMany(dto.products, req.user); }
  @Patch('admin/products/:id') @UseGuards(JwtAuthGuard, RolesGuard) @RequireRoles(Roles.SUPER_ADMIN, Roles.ADMIN) update(@Param('id') id: string, @Body() dto: UpdateProductDto, @Req() req: UserRequest) { return this.products.update(id, dto, req.user); }
}
