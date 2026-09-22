import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

/// Thin wrapper over the service-role Supabase client. Only the server holds
/// this key — it bypasses row-level security, so it must never be handed to a
/// browser.
@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('supabase.url');
    const serviceRoleKey = this.config.get<string>('supabase.serviceRoleKey');

    if (!url || !serviceRoleKey) {
      this.logger.warn(
        'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — storage and admin auth calls are disabled.',
      );
      return;
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.logger.log('Supabase admin client ready');
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error(
        'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    return this.client;
  }

  /// Public URL for an object already uploaded to the menu bucket.
  getPublicUrl(path: string): string {
    const bucket = this.config.get<string>('supabase.storageBucket') ?? 'menu';
    const { data } = this.getClient().storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  /*
   * Puts a file in a public bucket and hands back both the path and the URL.
   *
   * The path is what deletion needs later; the URL is what the app renders.
   * Callers keep both, so removing a post can remove its image too rather
   * than leaving the bucket filling with orphans.
   */
  async uploadPublic(
    bucket: string,
    path: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ path: string; url: string }> {
    const { error } = await this.getClient()
      .storage.from(bucket)
      .upload(path, body, { contentType, upsert: false });

    if (error) throw new Error(error.message);

    const { data } = this.getClient().storage.from(bucket).getPublicUrl(path);
    return { path, url: data.publicUrl };
  }

  /// Best-effort removal. A missing object is not worth failing a delete over.
  async removeObject(bucket: string, path: string): Promise<void> {
    const { error } = await this.getClient().storage.from(bucket).remove([path]);
    if (error) this.logger.warn(`Could not remove ${bucket}/${path}: ${error.message}`);
  }

  /// Creates a Supabase auth user for a staff member. Used when an admin adds
  /// a cook to the kitchen dashboard rather than inviting them by email.
  async createStaffUser(
    email: string,
    password: string,
    metadata: Record<string, unknown> = {},
  ): Promise<{ id: string; email: string }> {
    const { data, error } = await this.getClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? 'Supabase did not return a user');
    }

    return { id: data.user.id, email: data.user.email ?? email };
  }

  async deleteAuthUser(userId: string): Promise<void> {
    const { error } = await this.getClient().auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
  }
}
