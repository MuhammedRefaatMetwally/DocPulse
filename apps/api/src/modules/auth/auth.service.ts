import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export const cookieOptions = (config: ConfigService) => ({
  httpOnly: true,
  secure: config.get('NODE_ENV') === 'production',
  sameSite: 'lax' as const,
  path: '/',
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto, res: Response) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, passwordHash },
    });

    await this.issueTokensAndSetCookies(user.id, user.email, res);

    return {
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.issueTokensAndSetCookies(user.id, user.email, res);

    return {
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async refresh(userId: string, email: string, rawRefreshToken: string, res: Response) {
    const tokenHash = createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId, token: tokenHash, revoked: false },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    await this.issueTokensAndSetCookies(userId, email, res);

    return { ok: true };
  }

  async logout(userId: string, res: Response) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    res.clearCookie('access_token', cookieOptions(this.config));
    res.clearCookie('refresh_token', cookieOptions(this.config));

    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }

  private async issueTokensAndSetCookies(
    userId: string,
    email: string,
    res: Response,
  ): Promise<void> {
    const payload = { sub: userId, email };
    const accessSecret = this.config.getOrThrow<string>('JWT_SECRET');

    const [accessToken, rawRefreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: 900, // 15 minutes
      }),
      Promise.resolve(randomBytes(40).toString('hex')),
    ]);

    const refreshTokenHash = createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const base = cookieOptions(this.config);

    res.cookie('access_token', accessToken, {
      ...base,
      maxAge: 900 * 1000, // 15 min in ms
    });

    res.cookie('refresh_token', rawRefreshToken, {
      ...base,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });
  }
}