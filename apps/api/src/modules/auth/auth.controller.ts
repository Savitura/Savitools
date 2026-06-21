import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { FluxaDto } from './dto/fluxa.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register with email and password' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid registration data or user already exists' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { user, tokens } = await this.authService.register(dto);
    this.setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

    return {
      user: { id: user.id, email: user.email, fluxaTenantId: user.fluxaTenantId },
    };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { user, tokens } = await this.authService.login(dto);
    this.setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

    return {
      user: { id: user.id, email: user.email, fluxaTenantId: user.fluxaTenantId },
    };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and issue a new access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof refreshToken !== 'string') {
      this.clearAuthCookies(reply);
      return { authenticated: false };
    }

    const { user, tokens } = await this.authService.refresh(refreshToken);
    this.setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

    return {
      user: { id: user.id, email: user.email, fluxaTenantId: user.fluxaTenantId },
    };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Invalidate refresh token and clear auth cookies' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof refreshToken === 'string') {
      await this.authService.logout(refreshToken);
    }

    this.clearAuthCookies(reply);
    return { success: true };
  }

  @Post('fluxa')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Exchange a Fluxa API key for a SaviTools session and link accounts',
  })
  @ApiResponse({ status: 200, description: 'Fluxa authentication successful' })
  @ApiResponse({ status: 400, description: 'Invalid Fluxa API key' })
  async fluxa(
    @Body() dto: FluxaDto,
    @Req() request: FastifyRequest & { user?: { id: string } },
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const currentUser = request.user
      ? await this.authService.getUserById(request.user.id)
      : undefined;
    const { user, tokens } = await this.authService.fluxaLink(dto, currentUser ?? undefined);
    this.setAuthCookies(reply, tokens.accessToken, tokens.refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        fluxaTenantId: user.fluxaTenantId,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiResponse({ status: 200, description: 'User information retrieved' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async me(@CurrentUser() user: { id: string; email: string }) {
    const record = await this.authService.getUserById(user.id);

    return {
      user: record
        ? {
            id: record.id,
            email: record.email,
            fluxaTenantId: record.fluxaTenantId,
          }
        : null,
    };
  }

  private setAuthCookies(
    reply: FastifyReply,
    accessToken: string,
    refreshToken: string,
  ): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };

    reply.setCookie(ACCESS_TOKEN_COOKIE, accessToken, {
      ...cookieOptions,
      maxAge: ACCESS_TOKEN_TTL_SECONDS,
    });

    reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
    });
  }

  private clearAuthCookies(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_TOKEN_COOKIE, { path: '/' });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
  }
}
