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
  scopeDetails: string;
  processIntro: string;
  completionHeading: string;
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
  scopeDetails:
    'Vi vurderer lampen, underlaget og de eksisterende forhold, før vi laver en aftale. Vi udfører kun arbejde, der ikke kræver autorisation.',
  processIntro:
    'Beskriv lamperne, placeringen og det, du gerne vil have hjælp til.',
  completionHeading: 'Vi får lampen på plads',
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

export const socketPage: ServicePageContent = {
  service: services[1],
  title: 'Udskiftning af stikkontakter i Storkøbenhavn | Lys & Logik',
  description:
    'Få hjælp til udskiftning af eksisterende indendørs stikkontakter i Storkøbenhavn, hvor arbejdet må udføres uden autorisation. Beskriv din opgave.',
  heading: 'Få de gamle stikkontakter skiftet.',
  helpHeading: 'En opdatering på den samme plads.',
  scopeHeading: 'Eksisterende kontakter. Tydelige rammer.',
  faqHeading: 'Spørgsmål om stikkontakter.',
  contactHeading: 'Hvilke stikkontakter vil du have skiftet?',
  intro:
    'Er stikkontakterne gulnede, eller passer de ikke længere til rummet? Vi hjælper med at udskifte eksisterende indendørs stikkontakter, når installationen og placeringen tillader arbejde uden autorisation.',
  tasks: [
    'Udskiftning på den eksisterende placering',
    'En eller flere stikkontakter ved samme besøg',
    'Afklaring af en kompatibel model og ramme',
    'Et mere ensartet udtryk i rummet',
  ],
  situations: [
    'Stikkontakterne er gulnede og trænger til et nyt udtryk.',
    'Væggene er malet, men de gamle stikkontakter skiller sig ud.',
    'I vil gerne have et mere ensartet udtryk i boligen.',
  ],
  preparation:
    'Fortæl os, hvor mange stikkontakter du vil have skiftet, og i hvilke rum de sidder. Beskriv gerne den nuværende model og det udtryk, du ønsker. Du behøver ikke kende de tekniske betegnelser eller åbne stikkontakterne.',
  scopeDetails:
    'Ydelsen gælder almindelige indendørs stikkontakter i tørre rum. Vi afklarer placering, model og fejlstrømsbeskyttelse, før vi laver en aftale. Flytning, nye ledninger, udendørs stikkontakter og arbejde med særlige tæthedskrav er ikke omfattet.',
  processIntro:
    'Beskriv antallet af stikkontakter, rummene og det, du gerne vil have ændret.',
  completionHeading: 'Vi skifter de aftalte kontakter',
  questions: [
    {
      question: 'Kan I etablere eller flytte en stikkontakt?',
      answer:
        'Nej. Vi udskifter eksisterende stikkontakter på deres nuværende placering. Nye stikkontakter, flytning og udvidelse af installationen er ikke en del af denne ydelse.',
    },
    {
      question:
        'Kan alle eksisterende stikkontakter udskiftes uden autorisation?',
      answer:
        'Nej. Reglerne omfatter stikkontakter til højst 250 V på steder, hvor der ikke kræves højere tæthed end IP20, og installationen skal være beskyttet af en fejlstrømsafbryder på 30 mA (HFI eller HPFI). Vi vurderer de konkrete forhold. Opgaver uden for de tilladte rammer skal håndteres af en autoriseret virksomhed.',
    },
    {
      question: 'Skal jeg købe stikkontakterne først?',
      answer:
        'Vent gerne, til vi har afklaret opgaven. Den nye stikkontakt skal passe til den eksisterende installation og dåse. Vi aftaler model, materialer og omkostninger på forhånd.',
    },
    {
      question: 'Kan I ændre en stikkontakt uden jord til en med jord?',
      answer:
        'Det er ikke en opgradering, vi tilbyder som en del af denne ydelse. Jordforbindelsen og den eksisterende installation kræver en konkret vurdering. Vi etablerer ikke en ny jordleder.',
    },
    {
      question: 'Hvad koster udskiftningen?',
      answer:
        'Prisen afhænger blandt andet af antal stikkontakter, materialer og de eksisterende forhold. Vi aftaler pris og omfang, før arbejdet starter. Du kan også søge om at blive et af vores udvalgte pilotprojekter.',
    },
  ],
};

export const smartHomePage: ServicePageContent = {
  service: services[2],
  title: 'Smart-home opsætning i Storkøbenhavn | Lys & Logik',
  description:
    'Få hjælp til opsætning af kompatible smart-home-enheder, apps og scenarier i Storkøbenhavn. Vi afklarer mulighederne i dit hjem før en aftale.',
  heading: 'Et hjem, der er nemmere at styre.',
  helpHeading: 'Fra enkelte enheder til fælles funktioner.',
  scopeHeading: 'Opsætning og konfigurering i dit hjem.',
  faqHeading: 'Spørgsmål om smart home.',
  contactHeading: 'Hvad skal dit hjem kunne gøre lettere?',
  intro:
    'Sluk lyset samlet, vælg en aftenindstilling, eller lad en tidsplan klare det daglige. Vi hjælper med at sætte kompatible enheder og apps op, så de aftalte funktioner er nemme at bruge.',
  tasks: [
    'Tilføjelse af kompatible enheder i en app',
    'Opsætning af en kompatibel hub eller bridge',
    'Inddeling af enheder i rum og grupper',
    'Lysscener til hverdagens forskellige situationer',
    'Tidsplaner og enkle automatiseringer',
    'Gennemgang af betjeningen sammen med dig',
  ],
  situations: [
    'I har købt smarte enheder, men mangler at få dem sat op.',
    'I vil gerne kunne slukke flere lamper med ét tryk.',
    'De samme indstillinger bliver gentaget hver morgen eller aften.',
  ],
  preparation:
    'Fortæl os, hvilke enheder og apps du allerede bruger, og hvad du gerne vil kunne styre. Mærke og model hjælper os med at afklare mulighederne. Vi aftaler også, hvilke konti, netværksforbindelser og eventuelt ekstra udstyr der skal være klar.',
  scopeDetails:
    'Ydelsen omfatter opsætning i apps og konfigurering af kompatible enheder. Vi monterer ikke indbyggede relæer, trækker nye faste ledninger eller ændrer eltavlen som del af denne service. Du får en konkret aftale om enheder og funktioner, inden vi går i gang.',
  processIntro:
    'Beskriv dit nuværende udstyr, og hvad du gerne vil gøre nemmere i hverdagen.',
  completionHeading: 'Vi sætter op og gennemgår',
  questions: [
    {
      question: 'Virker mine enheder sammen?',
      answer:
        'Det afhænger af de konkrete modeller og systemer. Send os mærke og model på dit udstyr og navnet på den app, du bruger. Vi afklarer kompatibiliteten, før vi lover en bestemt funktion.',
    },
    {
      question: 'Skal jeg købe udstyr på forhånd?',
      answer:
        'Du kan både kontakte os med udstyr, du allerede har, og med en idé til en løsning. Vent gerne med nye køb, til vi har afklaret, hvad der passer sammen, og om der er behov for en hub eller andet ekstra udstyr.',
    },
    {
      question: 'Kan I hjælpe med en opsætning, jeg allerede er begyndt på?',
      answer:
        'Ja, beskriv hvor langt du er kommet, og hvad du gerne vil have hjælp til. Vi aftaler, hvilke enheder og indstillinger vi skal arbejde med. Omfanget afhænger af dit udstyr og den eksisterende opsætning.',
    },
    {
      question: 'Skal der ændres noget i elinstallationen?',
      answer:
        'Denne ydelse omfatter kun løsninger, der kan opsættes uden ændringer i den faste elinstallation. Hvis din ønskede løsning kræver indbyggede relæer eller nye faste ledninger, er det ikke omfattet af vores smart-home-service.',
    },
    {
      question: 'Kan jeg selv bruge og ændre opsætningen bagefter?',
      answer:
        'Vi gennemgår de aftalte funktioner sammen med dig, så du ved, hvordan du betjener løsningen og finder de relevante indstillinger. Fortæl os gerne på forhånd, hvem i hjemmet der skal kunne bruge den.',
    },
    {
      question: 'Hvad koster opsætningen?',
      answer:
        'Prisen afhænger af antal enheder, den eksisterende opsætning og de funktioner, vi aftaler. Eventuelt nyt udstyr betales separat. Du kan også søge om at blive et af vores udvalgte pilotprojekter.',
    },
  ],
};
