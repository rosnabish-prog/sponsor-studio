import { randomBytes, createHash } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import {
  Body, CanActivate, ConflictException, Controller, ExecutionContext, Get,
  Injectable, Post, Req, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { DatabaseService } from './database';

const COOKIE = 'ss_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = () => ({
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SESSION_MS,
});
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export interface AuthRequest extends Request {
  userId: string;
}

export class CredentialsDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @Length(12, 128) password!: string;
}

export class RegisterDto extends CredentialsDto {
  @IsString() @Length(1, 150) name!: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await hash(input.password, {
      algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, outputLen: 32, parallelism: 1,
    });
    try {
      return await this.db.user.create({ data: { email, name: input.name.trim(), passwordHash }, select: { id: true, email: true, name: true } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('Email already registered');
      throw error;
    }
  }

  async login(input: CredentialsDto) {
    const user = await this.db.user.findUnique({ where: { email: input.email.trim().toLowerCase() } });
    if (!user || !(await verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  async createSession(userId: string, res: Response) {
    const token = randomBytes(32).toString('base64url');
    await this.db.session.create({
      data: { userId, tokenHash: digest(token), expiresAt: new Date(Date.now() + SESSION_MS) },
    });
    res.cookie(COOKIE, token, cookieOptions());
  }

  async findSessionUserId(token: unknown): Promise<string | null> {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) }, select: { userId: true, expiresAt: true, revokedAt: true },
    });
    return session && !session.revokedAt && session.expiresAt.getTime() > Date.now() ? session.userId : null;
  }

  async revoke(token: unknown): Promise<void> {
    if (typeof token !== 'string') return;
    await this.db.session.updateMany({ where: { tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const origin = req.headers.origin;
    const allowedOrigin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
    if (origin && origin !== allowedOrigin) throw new UnauthorizedException('Untrusted request origin');
    const userId = await this.auth.findSessionUserId(req.cookies?.[COOKIE]);
    if (!userId) throw new UnauthorizedException('Sign in required');
    req.userId = userId;
    return true;
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: DatabaseService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() input: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(input);
    await this.auth.createSession(user.id, res);
    return { user };
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() input: CredentialsDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(input);
    await this.auth.createSession(user.id, res);
    return { user };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() req: AuthRequest) {
    return { user: await this.db.user.findUniqueOrThrow({ where: { id: req.userId }, select: { id: true, email: true, name: true } }) };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.revoke(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production', httpOnly: true });
    return { ok: true };
  }
}
