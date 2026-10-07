import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RequestUser } from './auth.types';

type UserRequest = Request & { user: RequestUser };
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private cookie(res: Response, value: string, expiry: Date) { res.cookie('trex_session', value, { httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax', expires: expiry, path: '/v1/auth' }); }
  private metadata(req: Request) { return { ip: req.ip, userAgent: req.get('user-agent') }; }
  @Post('login') @HttpCode(200) async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) { const result = await this.auth.login(dto.email, dto.password, this.metadata(req)); this.cookie(res, result.refreshToken, result.expiresAt); return { accessToken: result.accessToken }; }
  @Post('refresh') @HttpCode(200) async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) { const result = await this.auth.rotate(req.cookies?.trex_session ?? '', this.metadata(req)); this.cookie(res, result.refreshToken, result.expiresAt); return { accessToken: result.accessToken }; }
  @Post('logout') @HttpCode(204) async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const authorization = req.headers.authorization;
    const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    await this.auth.logout(req.cookies?.trex_session ?? '', accessToken);
    res.clearCookie('trex_session', { path: '/v1/auth' });
  }
  @Get('me') @UseGuards(JwtAuthGuard) me(@Req() req: UserRequest) { return { user: req.user }; }
}
