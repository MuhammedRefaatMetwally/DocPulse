import { Module } from '@nestjs/common';
import { ConfigModule , ConfigService  } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './database/prisma.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.getOrThrow<string>('REDIS_URL');
        const url = new URL(redisUrl);

        return {
          connection: {
            host: url.hostname,
            port: Number(url.port),
            password: url.password,
            // TLS required for Upstash (rediss://) — empty object enables it
            tls: redisUrl.startsWith('rediss://') ? {} : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
          },
        };
      },
    }),
    PrismaModule,
    AuthModule,
    WorkspacesModule,
  ],
})
export class AppModule {}
