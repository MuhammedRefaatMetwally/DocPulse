import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    UsersModule,
  ],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshGuard
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtRefreshGuard],
})
export class AuthModule {}