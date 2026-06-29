import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AccessControlModule } from "./common/access-control/access-control.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AssistantModule } from "./modules/assistant/assistant.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BudgetsModule } from "./modules/budgets/budgets.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { HealthModule } from "./modules/health/health.module";
import { IngredientsModule } from "./modules/ingredients/ingredients.module";
import { ProductsModule } from "./modules/products/products.module";
import { SalesModule } from "./modules/sales/sales.module";
import { StockModule } from "./modules/stock/stock.module";
import { SubscriptionsModule } from "./modules/subscriptions/subscriptions.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env.local", "../../.env", ".env.local", ".env"]
    }),
    AccessControlModule,
    HealthModule,
    AssistantModule,
    AuthModule,
    CompaniesModule,
    DashboardModule,
    IngredientsModule,
    ProductsModule,
    StockModule,
    CustomersModule,
    BudgetsModule,
    FinanceModule,
    SalesModule,
    AuditModule,
    SubscriptionsModule
  ]
})
export class AppModule {}
