/** Editable presentation content. All business details are placeholders for this local prototype. */
export const site = {
  name: 'Lys & Logik',
  area: 'Storkøbenhavn',
  email: 'hej@lysoglogik.example',
  phone: '+45 XX XX XX XX',
  companyStatus: 'Under etablering',
  pilotPlaces: 3,
  pilotHours: 8,
} as const;

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
