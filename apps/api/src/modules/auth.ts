import { randomBytes, createHash } from 'node:crypto';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import {
  BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, Get,
  Injectable, Post, Req, Res, ServiceUnavailableException, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { DatabaseService } from './database';

const COOKIE = 'ss_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;
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

export class ResetRequestDto {
  @IsEmail() @MaxLength(320) email!: string;
}

export class ResetPasswordDto {
  @IsString() @Length(32, 128) token!: string;
  @IsString() @Length(12, 128) password!: string;
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

  async requestPasswordReset(emailInput: string) {
    const sender = process.env.PASSWORD_RESET_SENDER;
    const region = process.env.AWS_REGION;
    const origin = process.env.APP_ORIGIN;
    if (!sender || !region || !origin ||
      (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))) {
      throw new ServiceUnavailableException('Email recovery is not configured');
    }

    const user = await this.db.user.findUnique({
      where: { email: emailInput.trim().toLowerCase() }, select: { id: true, email: true },
    });
    // Same response for nonexistent and existing addresses; never expose the token to the browser.
    if (!user) return { ok: true };
    const recent = await this.db.passwordResetToken.findFirst({ where: {
      userId: user.id, createdAt: { gt: new Date(Date.now() - 5 * 60 * 1000) },
    } });
    if (recent) return { ok: true }; // Also limit email volume per account, not just per requesting IP.
    const token = randomBytes(32).toString('base64url');
    const created = await this.db.$transaction(async tx => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      return tx.passwordResetToken.create({ data: {
        userId: user.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + RESET_MS),
      } });
    });
    const url = new URL(origin);
    // URL fragments never reach CDN/origin access logs or request referrers.
    url.hash = `reset=${encodeURIComponent(token)}`;
    try {
      const ses = new SESv2Client({ region });
      await ses.send(new SendEmailCommand({
        FromEmailAddress: sender,
        Destination: { ToAddresses: [user.email] },
        Content: { Simple: {
          Subject: { Data: 'Reset your Sponsor Studio password' },
          Body: { Text: { Data: `Use this link to reset your password (valid for 30 minutes):\n\n${url.toString()}\n\nIf you did not request this, ignore this email.` } },
        } },
      }));
    } catch {
      await this.db.passwordResetToken.deleteMany({ where: { id: created.id } });
      throw new ServiceUnavailableException('Could not deliver password reset email');
    }
    return { ok: true };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.db.passwordResetToken.findUnique({ where: { tokenHash: digest(token) } });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired reset link');
    }
    const passwordHash = await hash(password, {
      algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, outputLen: 32, parallelism: 1,
    });
    await this.db.$transaction(async tx => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (!claimed.count) throw new BadRequestException('Invalid or expired reset link');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
    });
    return { ok: true };
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

  @Post('password-reset/request')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestReset(@Body() input: ResetRequestDto) {
    return this.auth.requestPasswordReset(input.email);
  }

  @Post('password-reset/confirm')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  confirmReset(@Body() input: ResetPasswordDto) {
    return this.auth.resetPassword(input.token, input.password);
  }
}
