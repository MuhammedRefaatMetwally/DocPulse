import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '@/common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register — sets httpOnly cookies on success' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — sets httpOnly cookies on success' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Refresh — reads refresh_token cookie, sets new cookies' })
  refresh(
    @CurrentUser() user: CurrentUserPayload & { refreshToken: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.refresh(user.sub, user.email, user.refreshToken, res);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — clears both httpOnly cookies' })
  logout(
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(user.sub, res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.sub);
  }
}