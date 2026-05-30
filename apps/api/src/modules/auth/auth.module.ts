import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // secrets handled per-call in service
    UsersModule,
  ],
  providers: [AuthService, JwtStrategy, JwtRefreshGuard],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}