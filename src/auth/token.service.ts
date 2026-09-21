import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWTPayload, createRemoteJWKSet, jwtVerify } from 'jose';

export interface SupabaseTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

/// Verifies Supabase-issued access tokens.
///
/// Supabase projects sign either with the legacy shared HS256 secret or, on
/// newer projects, with asymmetric keys published at a JWKS endpoint. Both are
/// supported so this keeps working whichever the project uses — the secret
/// wins when set, otherwise verification falls back to JWKS.
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly secret: Uint8Array | null;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;
  private readonly issuer: string | undefined;

  constructor(config: ConfigService) {
    const jwtSecret = config.get<string>('supabase.jwtSecret');
    const url = config.get<string>('supabase.url');

    this.secret = jwtSecret ? new TextEncoder().encode(jwtSecret) : null;
    this.issuer = url ? `${url.replace(/\/$/, '')}/auth/v1` : undefined;
    this.jwks =
      !jwtSecret && url
        ? createRemoteJWKSet(
            new URL(`${url.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`),
          )
        : null;

    if (!this.secret && !this.jwks) {
      this.logger.warn(
        'No SUPABASE_JWT_SECRET and no SUPABASE_URL — every authenticated request will be rejected until credentials are supplied.',
      );
    }
  }

  async verify(token: string): Promise<SupabaseTokenClaims> {
    if (!this.secret && !this.jwks) {
      throw new UnauthorizedException('Auth is not configured on this server');
    }

    try {
      const { payload } = this.secret
        ? await jwtVerify(token, this.secret, { issuer: this.issuer })
        : await jwtVerify(token, this.jwks!, { issuer: this.issuer });

      if (!payload.sub) {
        throw new UnauthorizedException('Token is missing a subject');
      }

      return payload as SupabaseTokenClaims;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(
        `Invalid access token: ${(error as Error).message}`,
      );
    }
  }
}
