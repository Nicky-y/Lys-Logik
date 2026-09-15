import {
  LeadIdSchema,
  archiveStatuses,
  type LeadId,
  type LeadStatus,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import { sectionFromHash, type WorkspaceSection } from './shell/navigation.ts';

export type LeadCollection = 'inbox' | 'cases' | 'archive';
export interface WorkspaceRoute {
  section: WorkspaceSection;
  collection: LeadCollection;
  lead?: LeadId;
  day?: string;
}

export function collectionForStatus(status: LeadStatus): LeadCollection {
  return status === 'new'
    ? 'inbox'
    : archiveStatuses.includes(status)
      ? 'archive'
      : 'cases';
}

export function collectionPath(collection: LeadCollection): string {
  return collection === 'inbox'
    ? '#/indbakke'
    : collection === 'archive'
      ? '#/sager/arkiv'
      : '#/sager';
}

export function leadPath(id: LeadId, status: LeadStatus): string {
  return `${collectionPath(collectionForStatus(status))}/leads/${id}`;
}

/** Older notification and calendar links still resolve; loaded lead state selects its current home. */
export function readWorkspaceRoute(hash: string): WorkspaceRoute {
  const normalized = (
    !hash || hash === '#' || hash === '#/' ? '#/indbakke' : hash
  )
    .replace(/^#\/pipeline(?=\/|$)/, '#/sager')
    .replace(/^#\/archive(?=\/|$)/, '#/sager/arkiv')
    .replace(/^#\/calendar(?=\/|$)/, '#/kalender');
  const match = /\/leads\/([^/]+)$/.exec(normalized);
  const lead = match ? LeadIdSchema.safeParse(match[1]).data : undefined;
  const path = normalized.replace(/\/leads\/[^/]+$/, '');
  const collection: LeadCollection =
    path === '#/indbakke'
      ? 'inbox'
      : path === '#/sager/arkiv'
        ? 'archive'
        : 'cases';
  const calendar = /^#\/kalender(?:\/(\d{4}-\d{2}-\d{2}))?$/.exec(path);
  const candidate = calendar?.[1];
  const day =
    candidate &&
    candidate >= '2020-01-01' &&
    candidate <= '2100-12-31' &&
    Number.isFinite(Date.parse(`${candidate}T12:00:00Z`)) &&
    new Date(`${candidate}T12:00:00Z`).toISOString().slice(0, 10) === candidate
      ? candidate
      : undefined;
  return {
    section: sectionFromHash(
      calendar ? '#/kalender' : collection === 'archive' ? '#/sager' : path,
    ),
    collection,
    lead,
    day,
  };
}
