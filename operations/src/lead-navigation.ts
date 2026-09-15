import {
  LeadIdSchema,
  archiveStatuses,
  type LeadId,
  type LeadStatus,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import { sectionFromHash, type WorkspaceSection } from './shell/navigation.ts';
import {
  caseTrackForStatus,
  caseTracks,
  type CaseTrack,
} from './case-tracks.ts';

export type LeadCollection = 'inbox' | 'cases' | 'archive';
export interface WorkspaceRoute {
  section: WorkspaceSection;
  collection: LeadCollection;
  caseTrack: CaseTrack;
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

export function collectionPath(
  collection: LeadCollection,
  track: CaseTrack = 'planning',
): string {
  return collection === 'inbox'
    ? '#/indbakke'
    : collection === 'archive'
      ? '#/sager/arkiv'
      : track === 'settlement'
        ? '#/sager/opfoelgning'
        : '#/sager';
}

export function leadPath(id: LeadId, status: LeadStatus): string {
  return `${collectionPath(collectionForStatus(status), caseTrackForStatus(status))}/leads/${id}`;
}

/** Apply before pagination so one track cannot hide cases in the other. */
export function statusesForCollection(
  collection: LeadCollection,
  track: CaseTrack = 'planning',
): readonly LeadStatus[] {
  return collection === 'inbox'
    ? ['new']
    : collection === 'archive'
      ? archiveStatuses
      : caseTracks[track].statuses;
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
  const caseTrack: CaseTrack =
    path === '#/sager/opfoelgning' ? 'settlement' : 'planning';
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
      calendar
        ? '#/kalender'
        : collection === 'archive' || caseTrack === 'settlement'
          ? '#/sager'
          : path,
    ),
    collection,
    caseTrack,
    lead,
    day,
  };
}
