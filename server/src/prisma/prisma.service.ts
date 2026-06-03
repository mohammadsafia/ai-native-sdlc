import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established.');
    } catch (err) {
      this.logger.warn(
        'DB not reachable — app will start without a database connection. ' +
          'Requests that require the DB will fail until a database is available. ' +
          `Reason: ${(err as Error).message}`,
      );
      // Intentionally not re-throwing: allows the app to boot for OpenAPI export
      // and local development before Docker / Postgres is running.
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
