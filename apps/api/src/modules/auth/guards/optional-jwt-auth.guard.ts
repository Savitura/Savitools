import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const token = this.extractToken(request);

    if (!token) {
      return true;
    }

    try {
      const payload = this.jwtService.verify<{ sub: string; email: string }>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      request.user = { id: payload.sub, email: payload.email };
    } catch {
      // Ignore invalid access tokens for optional auth flows.
    }

    return true;
  }

  private extractToken(request: FastifyRequest): string | undefined {
    const cookieToken = request.cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof cookieToken === 'string' && cookieToken.length > 0) {
      return cookieToken;
    }

    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice(7);
    }

    return undefined;
  }
}
