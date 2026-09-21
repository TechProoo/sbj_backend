import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { StaffRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  /// Null when the token belongs to a customer rather than a staff member.
  role: StaffRole | null;
  fullName: string | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
