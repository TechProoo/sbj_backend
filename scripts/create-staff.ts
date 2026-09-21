/*
 * Creates a staff member: a Supabase Auth user plus the matching
 * staff_profiles row that actually grants the role.
 *
 * This exists to solve the chicken-and-egg at the start of a project — the
 * API's POST /api/auth/staff requires an existing MANAGER, so the very first
 * ADMIN cannot be made through it.
 *
 *   npm run create-staff -- --email owner@sbj.com --name "Owner" --role ADMIN
 *
 * Omit --password and a strong one is generated and printed once.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient, StaffRole } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/// Mixed-case + digits, no ambiguous characters, long enough that it can be
/// left as-is if the owner does not change it immediately.
function generatePassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(
    randomBytes(20),
    (byte) => alphabet[byte % alphabet.length],
  ).join('');
}

async function main(): Promise<void> {
  const email = arg('email');
  const fullName = arg('name');
  const roleInput = (arg('role') ?? 'KITCHEN').toUpperCase();
  const password = arg('password') ?? generatePassword();
  const generated = !arg('password');

  if (!email || !fullName) {
    throw new Error(
      'Usage: npm run create-staff -- --email <email> --name "<full name>" [--role ADMIN|MANAGER|KITCHEN|CASHIER] [--password <password>]',
    );
  }

  if (!(roleInput in StaffRole)) {
    throw new Error(
      `Unknown role "${roleInput}". Use one of: ${Object.keys(StaffRole).join(', ')}`,
    );
  }
  const role = roleInput as StaffRole;

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env',
    );
  }

  const supabase = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Reuse the auth user if this email already exists, so re-running the script
  // repairs a missing profile instead of failing outright.
  const { data: list, error: listError } =
    await supabase.auth.admin.listUsers();
  if (listError) throw new Error(listError.message);

  const existing = list.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );

  let userId: string;
  if (existing) {
    userId = existing.id;
    console.log(`Auth user already exists (${email}) — reusing it.`);
    if (!generated) {
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password,
      });
      if (error) throw new Error(error.message);
      console.log('Password updated.');
    }
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error || !data.user) {
      throw new Error(error?.message ?? 'Supabase returned no user');
    }
    userId = data.user.id;
    console.log(`Created Supabase auth user ${userId}`);
  }

  const profile = await prisma.staffProfile.upsert({
    where: { id: userId },
    update: { email, fullName, role, isActive: true },
    create: { id: userId, email, fullName, role, isActive: true },
  });

  console.log('');
  console.log(`  ${profile.fullName} — ${profile.role}`);
  console.log(`  email    ${profile.email}`);
  if (generated) {
    console.log(`  password ${password}`);
    console.log('');
    console.log('  Shown once. Change it after the first sign-in.');
  }
  console.log('');
  console.log('Sign in at the kitchen dashboard (npm run dev in kitchen/).');
}

main()
  .catch((error: Error) => {
    console.error(`\n${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
