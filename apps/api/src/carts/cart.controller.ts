import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartService } from './cart.service';
@Controller('carts')
export class CartController {
  constructor(private readonly carts: CartService) {}
  @Post('guest') async createGuest() { const key = randomBytes(32).toString('base64url'); const cart = await this.carts.createGuest(createHash('sha256').update(key).digest('hex')); return { ...cart, guestKey: key }; }
  @Get(':id') view(@Param('id') id: string, @Headers('x-guest-key') guestKey?:string) { return this.carts.view(id, guestKey ?? ''); }
  @Post(':id/items') addItem(@Param('id') id: string, @Headers('x-guest-key') guestKey:string|undefined, @Body() dto: AddCartItemDto) { return this.carts.addItem(id, guestKey ?? '', dto.productId, dto.quantity); }
}
