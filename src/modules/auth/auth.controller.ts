import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthRateLimit } from '../../common/throttling/throttler.config';
import { toUserResponse } from '../users/dto/user-response.dto';
import { CLIENT_HEADER, MOBILE_CLIENT } from './auth.constants';
import { AuthCookieService } from './auth-cookie.service';
import { AuthResult, AuthService } from './auth.service';
import type { AuthUser, ClientContext } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import {
  AuthResponseDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
} from './dto/auth.dto';

function isMobileClient(req: Request): boolean {
  return req.headers[CLIENT_HEADER] === MOBILE_CLIENT;
}

function clientContext(req: Request): ClientContext {
  return { userAgent: req.headers['user-agent']?.slice(0, 255) ?? null };
}

@ApiTags('Auth')
@ApiHeader({
  name: 'X-Client',
  required: false,
  description:
    'Send "mobile" to receive tokens in the response body instead of cookies.',
})
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @AuthRateLimit()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and log in' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.register(dto, clientContext(req));
    return this.respond(req, res, result);
  }

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto, clientContext(req));
    return this.respond(req, res, result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a new access token (rotates the refresh token)',
  })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    // Note: on failure we deliberately do NOT clear cookies. If two tabs refresh
    // at once, the loser's response must not wipe the winner's fresh cookies.
    const result = await this.authService.refresh(
      dto.refreshToken ?? this.cookies.readRefreshToken(req),
      clientContext(req),
    );
    return this.respond(req, res, result);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Log out of this device' })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logout(
      dto.refreshToken ?? this.cookies.readRefreshToken(req),
    );
    this.cookies.clear(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Log out of all devices' })
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    this.cookies.clear(res);
  }

  /** Browsers get httpOnly cookies; mobile apps get the tokens in the body. */
  private respond(
    req: Request,
    res: Response,
    { user, tokens }: AuthResult,
  ): AuthResponseDto {
    if (isMobileClient(req)) {
      return { user: toUserResponse(user), ...tokens };
    }
    this.cookies.set(res, tokens);
    return { user: toUserResponse(user) };
  }
}
