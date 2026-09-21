import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TokenService } from '../../auth/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/// Global guard. Verifies the Supabase access token and, when the subject is a
/// staff member, attaches their profile so RolesGuard can act on a real role
/// rather than a claim the client could have set itself.
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request);

    if (isPublic) {
      // Still resolve the user when a token happens to be present, so public
      // endpoints can personalise (e.g. prefill the checkout form).
      if (token) {
        try {
          request.user = await this.resolveUser(token);
        } catch {
          // A bad token on a public route is not an error.
        }
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.user = await this.resolveUser(token);
    return true;
  }

  private async resolveUser(token: string): Promise<AuthenticatedUser> {
    const claims = await this.tokens.verify(token);

    const staff = await this.prisma.staffProfile.findUnique({
      where: { id: claims.sub },
    });

    if (staff && !staff.isActive) {
      throw new UnauthorizedException('This staff account is disabled');
    }

    return {
      id: claims.sub,
      email: staff?.email ?? claims.email ?? '',
      role: staff?.role ?? null,
      fullName: staff?.fullName ?? null,
    };
  }
}

export function extractBearerToken(request: {
  headers: Record<string, unknown>;
}): string | null {
  const header = request.headers['authorization'];
  if (typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
}
