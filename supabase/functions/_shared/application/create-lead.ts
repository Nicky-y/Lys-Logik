import type {
  LeadReceipt,
  LeadSubmission,
  SubmissionKey,
} from '../contracts/lead.ts';

export type LeadFailureCode = 'conflict' | 'verification' | 'unavailable';
export class LeadFailure extends Error {
  readonly code: LeadFailureCode;
  constructor(code: LeadFailureCode) {
    super(code);
    this.name = 'LeadFailure';
    this.code = code;
  }
}

/** Persistence owns atomic creation of the enquiry, event and delivery outbox. */
export interface LeadRepository {
  findSubmission(
    key: SubmissionKey,
    lead: LeadSubmission,
  ): Promise<LeadReceipt | null>;
  createSubmission(
    key: SubmissionKey,
    lead: LeadSubmission,
  ): Promise<LeadReceipt>;
}

export interface LeadDependencies {
  repository: LeadRepository;
  verifyHuman(token: string, key: SubmissionKey): Promise<boolean>;
}

/** Replays a durable receipt before revalidating a single-use Turnstile token. */
export async function createLead(
  dependencies: LeadDependencies,
  key: SubmissionKey,
  lead: LeadSubmission,
  turnstileToken: string,
): Promise<LeadReceipt> {
  const existing = await dependencies.repository.findSubmission(key, lead);
  if (existing) return existing;
  if (
    !turnstileToken ||
    !(await dependencies.verifyHuman(turnstileToken, key))
  ) {
    throw new LeadFailure('verification');
  }
  return dependencies.repository.createSubmission(key, lead);
}
