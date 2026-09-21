import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { SupabaseAuthGuard } from './common/guards/supabase-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import configuration from './config/configuration';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { PromotionsModule } from './promotions/promotions.module';
import { ShowcaseModule } from './showcase/showcase.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TestimonialsModule } from './testimonials/testimonials.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    AdminModule,
    EventsModule,
    MenuModule,
    OrdersModule,
    PaymentsModule,
    KitchenModule,
    PromotionsModule,
    TestimonialsModule,
    ShowcaseModule,
    HealthModule,
  ],
  providers: [
    // Auth runs first and populates request.user; roles are checked after.
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
