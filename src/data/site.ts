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
  pilotHours: 8,
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
    id: 'belysning',
    number: '01',
    title: 'Lys, der gør en forskel',
    image: 'lighting',
    alt: 'Varme pendellamper over et spisebord i et lyst hjem',
    text: 'Den rigtige lampe. Det hyggelige hjørne. Vi hjælper med at finde en løsning, der passer til dit hjem.',
    label: 'Belysning',
  },
  {
    id: 'smart-home',
    number: '02',
    title: 'En lidt smartere hverdag',
    image: 'smart-home',
    alt: 'Stue med varmt, dæmpet lys og en enkel vægkontakt',
    text: 'Lys, der følger din hverdag. Smarte funktioner og enkle scenarier, som gør hjemmet lettere at bruge.',
    label: 'Smart home',
  },
  {
    id: 'forbedringer',
    number: '03',
    title: 'De små forbedringer',
    image: 'hero',
    alt: 'Varmt lys ved indgangen til et hus i skumringen',
    text: 'Har du en mindre opgave i tankerne? Fortæl os om den, så vurderer vi sammen mulighederne.',
    label: 'Mindre opgaver',
  },
] as const;

export const questions = [
  {
    question: 'Hvad er et pilotprojekt?',
    answer:
      'Et af vores første tre udvalgte referenceprojekter. Vi tilbyder op til otte timers arbejdsløn uden beregning mod, at vi efter nærmere aftale må dokumentere forløbet med billeder og bruge det som en case.',
  },
  {
    question: 'Hvad skal jeg selv betale?',
    answer:
      'Du betaler materialer og eventuelt nødvendigt lejeudstyr. Omfang og udgifter aftales, før vi går i gang. Arbejde ud over de otte timer kræver en særskilt aftale.',
  },
  {
    question: 'Hvilke opgaver kan komme i betragtning?',
    answer:
      'Vi leder efter mindre, overskuelige opgaver inden for lys og smart home. Vi er under etablering og vurderer hver opgave fagligt, så vi kun påtager os arbejde inden for virksomhedens aktuelle rammer.',
  },
  {
    question: 'Er jeg bundet, når jeg ansøger?',
    answer:
      'Nej. En ansøgning er starten på en samtale. Vi udvælger tre opgaver ud fra omfang, område og mulighederne for at skabe en god referencecase. Arbejdet begynder først efter en konkret aftale.',
  },
] as const;
