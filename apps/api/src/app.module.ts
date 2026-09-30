import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProductsModule } from './products/products.module';
import { JobsModule } from './jobs/jobs.module';
import { PricingModule } from './pricing/pricing.module';
import { InventoryModule } from './inventory/inventory.module';
import { CartModule } from './carts/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { ShippingModule } from './shipping/shipping.module';
import { DealersModule } from './dealers/dealers.module';
import { ReturnsModule } from './returns/returns.module';
import { CommissionsModule } from './commissions/commissions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ContentModule } from './content/content.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { AssetsModule } from './assets/assets.module';
import { CustomersModule } from './customers/customers.module';
import { CampaignsModule } from './campaigns/campaigns.module';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, JobsModule, HealthModule, AuthModule, ProductsModule, PricingModule, InventoryModule, CartModule, CheckoutModule, PaymentsModule, ShippingModule, DealersModule, ReturnsModule, CommissionsModule, NotificationsModule, ContentModule, WarehouseModule, AssetsModule, CustomersModule, CampaignsModule] })
export class AppModule {}
