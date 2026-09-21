export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigins: string[];
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
    jwtSecret: string;
    /// Storage bucket holding menu photography.
    storageBucket: string;
  };
  orders: {
    /// Flat delivery fee in Naira until zone-based pricing exists.
    deliveryFee: number;
    /// Percentage of subtotal, e.g. 2.5 for 2.5%.
    serviceFeePercent: number;
    minOrderTotal: number;
  };
  paystack: {
    secretKey: string;
    publicKey: string;
    /// Where Paystack returns the customer after they pay. The reference is
    /// appended by Paystack itself.
    callbackUrl: string;
    /// Payment methods offered on the Paystack page, in the order shown.
    channels: string[];
  };
}

const list = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) return fallback;
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 4000),
  corsOrigins: list(process.env.CORS_ORIGINS, [
    'http://localhost:5173',
    'http://localhost:5174',
  ]),
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
    storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'menu',
  },
  orders: {
    deliveryFee: num(process.env.DELIVERY_FEE, 1500),
    serviceFeePercent: num(process.env.SERVICE_FEE_PERCENT, 0),
    minOrderTotal: num(process.env.MIN_ORDER_TOTAL, 0),
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY ?? '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? '',
    callbackUrl:
      process.env.PAYSTACK_CALLBACK_URL ??
      'http://localhost:5173/payment/callback',
    // Everything Paystack can collect with in Nigeria. Dropping one here is
    // how you switch a method off — no code change.
    channels: list(process.env.PAYSTACK_CHANNELS, [
      'card',
      'bank_transfer',
      'ussd',
      'bank',
      'qr',
      'mobile_money',
      'eft',
    ]),
  },
});
