import { Prisma } from '@prisma/client';

/// Ticket numbers restart each service day, so the board shows SBJ-0412-007
/// rather than a five-digit id nobody can call across a kitchen.
export function formatOrderNumber(date: Date, sequence: number): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `SBJ-${dd}${mm}-${String(sequence).padStart(3, '0')}`;
}

export function startOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/// Two checkouts submitted in the same millisecond will compute the same
/// sequence; the unique index on order_number rejects the loser and this
/// retries with the next number rather than failing the customer.
export async function withOrderNumberRetry<T>(
  attempt: (orderNumber: string) => Promise<T>,
  nextSequence: () => Promise<number>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;

  for (let i = 0; i < maxAttempts; i += 1) {
    const sequence = (await nextSequence()) + i;
    const orderNumber = formatOrderNumber(new Date(), sequence);
    try {
      return await attempt(orderNumber);
    } catch (error) {
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002';
      if (!isDuplicate) throw error;
      lastError = error;
    }
  }

  throw lastError;
}
