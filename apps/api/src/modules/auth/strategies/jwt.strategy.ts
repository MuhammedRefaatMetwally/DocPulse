import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '@/modules/users/users.service';
import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
}

// Extract JWT from httpOnly cookie instead of Authorization header
const cookieExtractor = (req: Request): string | null => {
  return req?.cookies?.access_token ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      // Try cookie first, fall back to Bearer header for Swagger/API clients
      jwtFromRequest: (req: Request) => {
        return cookieExtractor(req) ?? extractBearerToken(req);
      },
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User no longer exists');
    return { sub: payload.sub, email: payload.email };
  }
}

// Fallback extractor for Swagger and direct API clients
function extractBearerToken(req: Request): string | null {
  const auth = req?.headers?.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}