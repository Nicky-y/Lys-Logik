import {
  serviceLabels,
  type Service,
} from '../../supabase/functions/_shared/contracts/service.ts';

/** Shared business details and editable website content. */
export const site = {
  name: 'Lys & Logik',
  legalName: 'Lys & Logik I/S',
  cvr: '45 82 71 27',
  area: 'Storkøbenhavn',
  vision:
    'Vi bygger Lys & Logik med godt elhåndværk som fundament og teknologi som en del af driften. Vi udvikler egne softwareværktøjer og nye arbejdsgange, der skal forbedre planlægning, logistik og dokumentation. Målet er at kunne vokse uden at miste overblik, kvalitet eller nærhed til kunden – og med tiden måle os med de bedste i Norden.',
  email: 'kontakt@lysoglogik.dk',
  phone: '71 41 84 81',
  phoneHref: 'tel:+4571418481',
  pilotPlaces: 3,
  pilotHours: 4,
} as const;

export const socialProfiles = [
  {
    name: 'Instagram',
    icon: 'instagram',
    url: 'https://www.instagram.com/lysoglogik/',
  },
  {
    name: 'Facebook',
    icon: 'facebook',
    url: 'https://www.facebook.com/profile.php?id=61594299360677',
  },
  {
    name: 'TikTok',
    icon: 'tiktok',
    url: 'https://www.tiktok.com/@lys_og_logik',
  },
  {
    name: 'YouTube',
    icon: 'youtube',
    url: 'https://www.youtube.com/@LysogLogik',
  },
] as const;

export const trustpilotUrl = 'https://www.trustpilot.com/review/lysoglogik.dk';

export const services = [
  {
    id: 'lampeopsaetning',
    tag: 'Lamper',
    number: '01',
    page: 'lampeopsaetning',
    teaser: 'Loft- og væglamper på plads i eksisterende lampeudtag.',
    label: serviceLabels.lampeopsaetning,
    image: 'lighting-960.webp',
    imageAlt:
      'Pendellamper med varmt lys over et spisebord. Inspirationsbillede.',
    text: 'Få lampen over spisebordet eller ved sengen på plads. Vi hjælper med ophængning og tilslutning af loft- og væglamper.',
    scope:
      'Tilslutning sker i eksisterende lampeudtag. Nye udtag og ændringer af den faste installation er ikke omfattet.',
  },
  {
    id: 'stikkontakter',
    tag: 'Stikkontakter',
    number: '02',
    page: 'stikkontakter',
    teaser:
      'Udskiftning af eksisterende indendørs stikkontakter inden for de tilladte rammer.',
    label: serviceLabels.stikkontakter,
    image: 'service-stikkontakter-v1.webp',
    imageAlt:
      'Hvid stikkontakt på en lys væg. AI-genereret inspirationsbillede.',
    text: 'Vi hjælper med at udskifte eksisterende indendørs stikkontakter, når installationen og placeringen tillader arbejde uden autorisation.',
    scope:
      'Vi vurderer de eksisterende forhold, herunder fejlstrømsbeskyttelsen, før en aftale. Vi etablerer ikke nye stikkontakter.',
  },
  {
    id: 'smart-home',
    tag: 'Smart-home',
    number: '03',
    page: 'smart-home',
    teaser: 'Få kompatible enheder, apps og lysscener til at arbejde sammen.',
    label: serviceLabels['smart-home'],
    image: 'service-smart-home-v1.webp',
    imageAlt:
      'Telefon med styring af hjemmets belysning. AI-genereret inspirationsbillede.',
    text: 'Få dine kompatible enheder til at arbejde sammen. Vi hjælper med opsætning, apps og scenarier, der passer til din hverdag.',
    scope:
      'Vi konfigurerer løsninger, der kan bruges uden ændringer i den faste elinstallation. Enhedernes kompatibilitet afklares på forhånd.',
  },
  {
    id: 'lysstyring-sensorer',
    tag: 'Lysstyring',
    number: '04',
    page: 'lysstyring',
    teaser: 'Lys, der følger din hverdag med sensorer og tidsstyring.',
    label: serviceLabels['lysstyring-sensorer'],
    image: 'smart-home-960.webp',
    imageAlt:
      'Lysafbryder ved en stue med dæmpet belysning. Inspirationsbillede.',
    text: 'Lys, der tænder ved bevægelse eller følger en tidsplan. Vi hjælper med kompatibel lysstyring, sensorer og udskiftning af eksisterende indendørs afbrydere.',
    scope:
      'Opsætning og udskiftning sker kun, hvor arbejdet ikke kræver autorisation. Nye ledninger i den faste installation er ikke omfattet.',
  },
  {
    id: 'hvidevarer',
    tag: 'Hvidevarer',
    number: '05',
    page: 'hvidevarer',
    teaser:
      'Tilslutning med stikprop i en eksisterende, kompatibel stikkontakt.',
    label: serviceLabels.hvidevarer,
    image: 'service-hvidevarer-v1.webp',
    imageAlt:
      'Tørretumbler i et lyst bryggers. AI-genereret inspirationsbillede.',
    text: 'Vi hjælper med den elektriske tilslutning af kompatible hvidevarer med stikprop, for eksempel et køleskab eller en tørretumbler.',
    scope:
      'Stikproppen skal passe til en eksisterende stikkontakt, og tilslutningen skal kunne ske uden værktøj. Fast tilslutning og VVS-arbejde er ikke omfattet.',
  },
] as const satisfies readonly {
  id: Service;
  tag: string;
  number: string;
  page: string | null;
  teaser: string;
  label: string;
  image: string;
  imageAlt: string;
  text: string;
  scope: string;
}[];

export const questions = [
  {
    question: 'Hvad er et pilotprojekt?',
    answer: `Et af vores første tre udvalgte referenceprojekter. Vi tilbyder op til ${site.pilotHours} timers arbejde uden beregning mod, at vi efter nærmere aftale må dokumentere forløbet med billeder og bruge det som en case.`,
  },
  {
    question: 'Hvad skal jeg selv betale?',
    answer: `Du betaler materialer og eventuelt nødvendigt lejeudstyr. Omfang og udgifter aftales, før vi går i gang. Arbejde ud over de ${site.pilotHours} timer kræver en særskilt aftale.`,
  },
  {
    question: 'Hvilke opgaver kan komme i betragtning?',
    answer:
      'Mindre opgaver inden for lampeopsætning, stikkontakter, smart home, lysstyring og hvidevarer med stikprop. Vi vurderer hver opgave fagligt og udvælger kun arbejde, der kan udføres uden autorisation og passer til pilotforløbet.',
  },
  {
    question: 'Er jeg bundet, når jeg ansøger?',
    answer:
      'Nej. En ansøgning er starten på en samtale. Vi udvælger tre opgaver ud fra omfang, område og mulighederne for at skabe en god referencecase. Arbejdet begynder først efter en konkret aftale.',
  },
] as const;
