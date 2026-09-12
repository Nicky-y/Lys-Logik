import { services } from './site';

/** Content for a published service page; catalogue entries can exist before their page. */
export interface ServicePageContent {
  service: (typeof services)[number];
  title: string;
  description: string;
  heading: string;
  helpHeading: string;
  scopeHeading: string;
  faqHeading: string;
  contactHeading: string;
  intro: string;
  tasks: string[];
  situations: string[];
  preparation: string;
  questions: { question: string; answer: string }[];
}

export const lampPage: ServicePageContent = {
  service: services[0],
  title: 'Lampeopsætning i Storkøbenhavn | Lys & Logik',
  description:
    'Få hjælp til ophængning af loft- og væglamper og tilslutning i eksisterende lampeudtag i Storkøbenhavn. Fortæl Lys & Logik om din opgave.',
  heading: 'Få lampen på plads. Og lys i hverdagen.',
  helpHeading: 'Fra én pendel til flere lamper.',
  scopeHeading: 'Vi starter med det, der allerede er.',
  faqHeading: 'Spørgsmål om lampeopsætning.',
  contactHeading: 'Hvilken lampe skal vi hjælpe med?',
  intro:
    'Den nye lampe skal hænge rigtigt og give lys dér, hvor du har brug for det. Vi hjælper med ophængning, justering og tilslutning i eksisterende lampeudtag.',
  tasks: [
    'Loftlamper og pendler',
    'Væglamper ved seng eller sofa',
    'Lamper over spisebordet',
    'Flere lamper i samme rum',
    'Tilpasning af ophængningshøjde',
    'Tilslutning i eksisterende lampeudtag',
  ],
  situations: [
    'Lampen er købt, men ligger stadig i kassen.',
    'I er flyttet og mangler at få lamperne op.',
    'Lampen over bordet hænger for højt eller for lavt.',
  ],
  preparation:
    'Fortæl os, hvor mange lamper det drejer sig om, hvor de skal hænge, og om der allerede er lampeudtag. Oplys gerne, hvis loftet er højt, lampen er tung, eller underlaget kræver særlig opmærksomhed.',
  questions: [
    {
      question: 'Skal jeg selv have købt lampen?',
      answer:
        'Fortæl os, om du allerede har lampen, eller stadig er ved at vælge. Lampen, ophænget og de eksisterende forhold skal passe sammen. Materialer og eventuelt udstyr aftaler vi på forhånd.',
    },
    {
      question: 'Kan I lave et nyt lampeudtag?',
      answer:
        'Nej. Denne ydelse omfatter ophængning og tilslutning i eksisterende lampeudtag. Nye udtag og ændringer af den faste elinstallation er ikke omfattet.',
    },
    {
      question: 'Kan I sætte flere lamper op ved samme besøg?',
      answer:
        'Beskriv antal lamper og placeringer i din henvendelse. Så vurderer vi det samlede omfang, inden vi aftaler et besøg.',
    },
    {
      question: 'Hvad koster lampeopsætning?',
      answer:
        'Vi aftaler pris og omfang med dig, før arbejdet starter. Du kan også søge om at blive et af vores udvalgte pilotprojekter. En henvendelse er uforpligtende.',
    },
  ],
};
