import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PAYSTACK_API = 'https://api.paystack.co';

/// Shapes are narrowed to the fields we actually read. Paystack sends a great
/// deal more; the whole body is kept on the payment row instead of typed here.
export interface PaystackInitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackTransaction {
  id: number;
  reference: string;
  /// `success` | `failed` | `abandoned` | `ongoing` | `pending` | `reversed`
  status: string;
  amount: number;
  currency: string;
  channel?: string | null;
  paid_at?: string | null;
  gateway_response?: string | null;
  metadata?: Record<string, unknown> | null;
  authorization?: { channel?: string | null } | null;
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

/// Thin wrapper over the two Paystack calls we make. Everything that decides
/// what a response *means* lives in PaymentsService; this only speaks HTTP.
@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return this.secretKey.length > 0;
  }

  /// True while the account is still on test keys — the storefront shows a
  /// test-mode notice rather than letting someone think they have been charged.
  get isTestMode(): boolean {
    return this.secretKey.startsWith('sk_test_');
  }

  get publicKey(): string {
    return this.config.get<string>('paystack.publicKey') ?? '';
  }

  get channels(): string[] {
    return this.config.get<string[]>('paystack.channels') ?? ['card'];
  }

  private get secretKey(): string {
    return this.config.get<string>('paystack.secretKey') ?? '';
  }

  async initialize(payload: {
    email: string;
    /// Kobo.
    amount: number;
    reference: string;
    callbackUrl: string;
    metadata: Record<string, unknown>;
  }): Promise<PaystackInitializeResponse> {
    return this.post<PaystackInitializeResponse>('/transaction/initialize', {
      email: payload.email,
      amount: payload.amount,
      currency: 'NGN',
      reference: payload.reference,
      callback_url: payload.callbackUrl,
      channels: this.channels,
      metadata: payload.metadata,
    });
  }

  async verify(reference: string): Promise<PaystackTransaction> {
    return this.get<PaystackTransaction>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  }

  /// Paystack signs every webhook with HMAC-SHA512 of the raw body under the
  /// secret key. Verified against the bytes as received — re-serialising the
  /// parsed JSON changes key order and whitespace, and the digest with it.
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !this.isConfigured) return false;

    const expected = createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    const received = Buffer.from(signature, 'utf8');
    const computed = Buffer.from(expected, 'utf8');

    // Lengths must match before timingSafeEqual, which throws otherwise.
    if (received.length !== computed.length) return false;
    return timingSafeEqual(received, computed);
  }

  // ------------------------------------------------------------ transport

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.call<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async get<T>(path: string): Promise<T> {
    return this.call<T>(path, { method: 'GET' });
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.isConfigured) {
      throw new InternalServerErrorException(
        'Paystack is not configured on this server',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${PAYSTACK_API}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${this.secretKey}`,
        },
        // Paystack is normally sub-second; a hung socket must not hold a
        // checkout request open until the client gives up.
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      this.logger.error(`Paystack ${path} unreachable`, error as Error);
      throw new ServiceUnavailableException(
        'Could not reach Paystack. Please try again.',
      );
    }

    const body = (await response
      .json()
      .catch(() => null)) as PaystackEnvelope<T> | null;

    if (!response.ok || !body?.status) {
      const message = body?.message ?? `Paystack returned ${response.status}`;
      this.logger.error(`Paystack ${path} failed: ${message}`);
      throw new ServiceUnavailableException(`Paystack: ${message}`);
    }

    return body.data;
  }
}
