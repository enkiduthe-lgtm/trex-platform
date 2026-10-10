import { Module } from '@nestjs/common';
import { CurrentAccountsController } from './current-accounts.controller';
import { CurrentAccountsService } from './current-accounts.service';
@Module({ controllers: [CurrentAccountsController], providers: [CurrentAccountsService] })
export class CurrentAccountsModule {}
