import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { LeadReceiptSchema } from '../../supabase/functions/_shared/contracts/lead.ts';
import {
  LeadFailure,
  type LeadRepository,
} from '../../supabase/functions/_shared/application/create-lead.ts';

/** PostgreSQL engine with minimal Supabase auth fixtures; no remote account is used. */
export async function createTestDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to authenticated;
  `);
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const migrations = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations) await db.exec(await readFile(new URL(name, directory), 'utf8'));
  return db;
}

export function testRepository(db: PGlite): LeadRepository {
  async function run(name: string, key: string, lead: unknown) {
    try {
      const { rows } = await db.query<{ receipt: unknown }>(
        `select public.${name}($1::uuid, $2::jsonb) as receipt`,
        [key, JSON.stringify(lead)],
      );
      return rows[0].receipt === null
        ? null
        : LeadReceiptSchema.parse(rows[0].receipt);
    } catch (error) {
      if (error instanceof Error && error.message === 'submission_conflict')
        throw new LeadFailure('conflict');
      throw error;
    }
  }
  return {
    findSubmission: (key, lead) => run('find_lead_submission', key, lead),
    async createSubmission(key, lead) {
      const receipt = await run('create_lead_submission', key, lead);
      if (!receipt) throw new Error('Missing receipt');
      return receipt;
    },
  };
}

export const validLead = {
  name: 'Anna Jensen',
  email: 'anna@example.com',
  phone: '+45 12 34 56 78',
  postalCode: '0800',
  service: 'belysning' as const,
  description: 'Jeg vil gerne have bedre lys over spisebordet.',
  terms: true as const,
};
export const submissionKey = '82b2db71-774d-47f7-bfe3-b386992320ce';
