import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '@prisma/client';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<StaffRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user?.role) {
      throw new ForbiddenException('This endpoint is for staff only');
    }

    // ADMIN is deliberately a skeleton key — the owner should never be locked
    // out of a station mid-service.
    if (user.role === StaffRole.ADMIN || required.includes(user.role)) {
      return true;
    }

    throw new ForbiddenException(
      `Requires one of: ${required.join(', ')}`,
    );
  }
}
