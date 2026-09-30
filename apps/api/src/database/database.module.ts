import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [{ provide: Pool, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }) }, DatabaseService],
  exports: [Pool, DatabaseService],
})
export class DatabaseModule {}
