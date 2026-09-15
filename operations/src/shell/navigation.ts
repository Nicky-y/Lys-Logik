import {
  CalendarDays,
  FileCheck2,
  FolderOpen,
  Inbox,
  ReceiptText,
  Settings2,
  UsersRound,
} from 'lucide-react';

export const workspaceSections = [
  {
    id: 'sager',
    label: 'Sager',
    description: 'Et samlet overblik over jeres opgaver.',
    icon: FolderOpen,
  },
  {
    id: 'kunder',
    label: 'Kunder',
    description: 'Menneskerne og virksomhederne, I hjælper.',
    icon: UsersRound,
  },
  {
    id: 'kalender',
    label: 'Kalender',
    description: 'Plads til aftaler og planlægning.',
    icon: CalendarDays,
  },
  {
    id: 'tilbud',
    label: 'Tilbud',
    description: 'Fra den første dialog til en god aftale.',
    icon: FileCheck2,
  },
  {
    id: 'fakturaer',
    label: 'Fakturaer',
    description: 'Overblik over fakturaer og betalinger.',
    icon: ReceiptText,
  },
  {
    id: 'indstillinger',
    label: 'Indstillinger',
    description: 'Jeres virksomhed. Jeres arbejdsrum.',
    icon: Settings2,
  },
  {
    id: 'indbakke',
    label: 'Indbakke',
    description: 'Nye henvendelser, der venter på den første behandling.',
    icon: Inbox,
  },
] as const;

export type WorkspaceSection = (typeof workspaceSections)[number];

export function sectionFromHash(hash: string): WorkspaceSection {
  return (
    workspaceSections.find((section) => hash === `#/${section.id}`) ??
    workspaceSections[0]
  );
}
