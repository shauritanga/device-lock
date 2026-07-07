import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  JwtPayload,
  RefreshPayload,
} from './auth.types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Hash a password with Argon2id. */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    // No tenant context here (public route) -> lookup is cross-tenant by email.
    const user = await this.prisma.scoped.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.scoped.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.verifyRefresh(refreshToken);

    const row = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
    });
    const now = new Date();
    if (!row || row.revokedAt || row.expiresAt < now) {
      throw new UnauthorizedException('Refresh token not active');
    }
    if (row.tokenHash !== sha256(refreshToken)) {
      // Hash mismatch => possible reuse/theft. Revoke to be safe.
      await this.prisma.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException('Refresh token mismatch');
    }

    // Rotate: revoke the old token, issue a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: now },
    });

    const user = await this.prisma.scoped.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive');
    }
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshPayload;
    try {
      payload = await this.verifyRefresh(refreshToken);
    } catch {
      return; // already invalid; nothing to do
    }
    await this.prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const jti = randomUUID();

    const accessPayload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      type: 'access',
    };
    const refreshPayload: RefreshPayload = {
      sub: user.id,
      jti,
      type: 'refresh',
    };

    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL', 900);
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL', 2592000);

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  private verifyRefresh(token: string): Promise<RefreshPayload> {
    return this.jwt
      .verifyAsync<RefreshPayload>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      })
      .then((p) => {
        if (p.type !== 'refresh') {
          throw new UnauthorizedException('Wrong token type');
        }
        return p;
      })
      .catch(() => {
        throw new UnauthorizedException('Invalid refresh token');
      });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
