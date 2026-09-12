import { z } from 'zod';

/** Current catalogue choices plus historical categories retained on existing enquiries. */
export const ServiceSchema = z.enum(
  [
    'lampeopsaetning',
    'stikkontakter',
    'smart-home',
    'lysstyring-sensorer',
    'hvidevarer',
    'belysning',
    'forbedringer',
    'andet',
  ],
  { error: 'Vælg, hvad du gerne vil have hjælp til.' },
);

export type Service = z.infer<typeof ServiceSchema>;

export const serviceLabels: Record<Service, string> = {
  lampeopsaetning: 'Lampeopsætning',
  stikkontakter: 'Udskiftning af stikkontakter',
  'smart-home': 'Smart-home opsætning og konfigurering',
  'lysstyring-sensorer': 'Lysstyring og sensorer',
  hvidevarer: 'Tilslutning af hvidevarer med stikprop',
  belysning: 'Belysning',
  forbedringer: 'Mindre opgave',
  andet: 'Anden opgave',
};
