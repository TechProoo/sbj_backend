import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/// Marks a route as reachable without an access token — the customer menu and
/// guest checkout both rely on this.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
