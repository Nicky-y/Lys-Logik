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

export const appliancePage: ServicePageContent = {
  service: services[4],
  title: 'Tilslutning af hvidevarer med stikprop i Storkøbenhavn | Lys & Logik',
  description:
    'Få hjælp til elektrisk tilslutning af kompatible hvidevarer med stikprop i Storkøbenhavn. Vi afklarer apparatet og den eksisterende stikkontakt før besøget.',
  heading: 'Få din hvidevare sluttet til.',
  helpHeading: 'Hjælp til den elektriske tilslutning.',
  scopeHeading: 'Stikprop og eksisterende stikkontakt.',
  faqHeading: 'Spørgsmål om tilslutning af hvidevarer.',
  contactHeading: 'Hvilken hvidevare skal sluttes til?',
  intro:
    'Et nyt køleskab eller en tørretumbler skal passe til tilslutningen i dit hjem. Vi hjælper med den elektriske tilslutning af kompatible hvidevarer med stikprop og afklarer forholdene, inden vi kommer.',
  tasks: [
    'Elektrisk tilslutning af køleskab eller fryser med stikprop',
    'Elektrisk tilslutning af en kompatibel tørretumbler med stikprop',
    'Frakobling af et eksisterende apparat med stikprop',
    'Afklaring af apparatets krav og den eksisterende tilslutning',
    'Kontrol af, at stikprop og stikkontakt passer sammen',
    'Aftalt afprøvning efter producentens anvisninger',
  ],
  situations: [
    'Det nye køleskab er leveret, og I vil have hjælp til tilslutningen.',
    'I er i tvivl om, hvorvidt apparatets stik passer til stikkontakten.',
    'En hvidevare skal udskiftes på den eksisterende placering.',
  ],
  preparation:
    'Fortæl os, hvilket apparat det drejer sig om, gerne med mærke og model. Beskriv den eksisterende stikkontakt, placeringen og adgangsforholdene. Oplys også, om et gammelt apparat skal kobles fra. Du behøver ikke åbne stik eller installationer.',
  scopeDetails:
    'Vi tilbyder den elektriske tilslutning via en egnet, eksisterende stikkontakt. Apparatets krav, stiktype og jordforbindelse skal passe til forholdene. Fast tilslutning i en dåse, nye stikkontakter og ændringer af den faste elinstallation er ikke omfattet. Vand, afløb, gas, indbygning og bortkørsel er heller ikke en del af denne ydelse.',
  processIntro:
    'Beskriv apparatet, placeringen og den tilslutning, der allerede findes.',
  completionHeading: 'Vi tilslutter og afprøver',
  questions: [
    {
      question: 'Kan I tilslutte et apparat uden stikprop?',
      answer:
        'Nej. Denne ydelse gælder apparater med stikprop, som kan tilsluttes en egnet, eksisterende stikkontakt. Vi udfører ikke fast tilslutning i en dåse eller ændringer af den faste elinstallation.',
    },
    {
      question: 'Passer alle stikpropper til alle stikkontakter?',
      answer:
        'Nej. Stiktype og apparatets krav skal passe til stikkontakten, og en nødvendig jordforbindelse skal overføres korrekt. Vi afklarer de konkrete forhold, før vi aftaler tilslutningen.',
    },
    {
      question: 'Tilslutter I også vand og afløb?',
      answer:
        'Nej. Her tilbyder vi alene den elektriske tilslutning. Hvis apparatet også kræver vand, afløb eller andre tilslutninger, skal det håndteres særskilt, før det kan tages i brug.',
    },
    {
      question: 'Flytter I apparatet og tager det gamle med?',
      answer:
        'Indbæring, tunge løft, indbygning og bortkørsel er ikke inkluderet. Fortæl os om placering og adgangsforhold, så vi kan aftale, hvad der skal være klar ved besøget.',
    },
    {
      question: 'Kan I tilslutte en ovn eller et komfur?',
      answer:
        'Kun hvis det konkrete apparat har en passende stikprop og kan tilsluttes uden indgreb i den faste installation. Send os mærke og model samt oplysninger om tilslutningen. Vi vurderer opgaven, før vi laver en aftale.',
    },
    {
      question: 'Hvad koster tilslutningen?',
      answer:
        'Vi aftaler pris og omfang ud fra apparatet og de eksisterende forhold. Apparatet og eventuelle materialer betales separat. Du kan også søge om at blive et af vores udvalgte pilotprojekter.',
    },
  ],
};

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

export const lightingControlPage: ServicePageContent = {
  service: services[3],
  title: 'Lysstyring og sensorer i Storkøbenhavn | Lys & Logik',
  description:
    'Få hjælp til kompatibel lysstyring, sensorer og tidsplaner i Storkøbenhavn. Vi afklarer udstyr og eksisterende installation, før vi aftaler opgaven.',
  heading: 'Lys, når du har brug for det.',
  helpHeading: 'Tilpas lyset til rummet og hverdagen.',
  scopeHeading: 'En løsning, der passer til det eksisterende.',
  faqHeading: 'Spørgsmål om lysstyring og sensorer.',
  contactHeading: 'Hvor skal lyset gøre hverdagen lettere?',
  intro:
    'Lys i gangen, når du går forbi. En tidsplan til de daglige rutiner. En roligere lysstyrke om aftenen. Vi hjælper med opsætning af kompatibel lysstyring og sensorer med udgangspunkt i dit rum og dit udstyr.',
  tasks: [
    'Opsætning af kompatible trådløse bevægelsessensorer',
    'Tidsplaner for tænding og slukning',
    'Indstilling af lysstyrke på kompatibelt udstyr',
    'Tilpasning af sensorens indstillinger og placering',
    'Udskiftning af eksisterende indendørs afbrydere, hvor det er tilladt',
    'Afprøvning af de aftalte funktioner i rummet',
  ],
  situations: [
    'Lyset i gangen skal tænde, når nogen går forbi.',
    'I vil gerne have en lavere lysstyrke om aftenen.',
    'Lyset skal følge en tidsplan, som passer til jeres hverdag.',
  ],
  preparation:
    'Beskriv rummet, det lys du har i dag, og hvornår det skal tænde, dæmpes eller slukke. Fortæl gerne, hvilke lamper, pærer, afbrydere og eventuelle sensorer du allerede har. Så kan vi afklare, hvad der passer sammen.',
  scopeDetails:
    'Vi tager udgangspunkt i løsninger, der kan opsættes og konfigureres uden nye faste ledninger. Udskiftning af en eksisterende indendørs afbryder vurderes særskilt ud fra produktet og installationen. Nye tilslutningssteder, indbyggede relæer og andre autorisationskrævende ændringer er ikke omfattet.',
  processIntro:
    'Fortæl, hvilket rum det drejer sig om, og hvordan du ønsker, at lyset skal reagere.',
  completionHeading: 'Vi indstiller og afprøver lyset',
  questions: [
    {
      question: 'Kan en sensor bruges sammen med mine nuværende lamper?',
      answer:
        'Det afhænger af lampen, lyskilden og den valgte styring. Fortæl os, hvilket udstyr du har. Vi afklarer kompatibiliteten, før vi aftaler en løsning eller anbefaler, at du køber nyt.',
    },
    {
      question: 'Skal der trækkes nye ledninger?',
      answer:
        'Nye ledninger i den faste installation er ikke en del af denne ydelse. Vi tager udgangspunkt i kompatible trådløse løsninger og eksisterende tilslutninger. Hvis opgaven kræver ændringer uden for vores rammer, aftaler vi ikke at udføre dem.',
    },
    {
      question: 'Kan I udskifte en eksisterende afbryder?',
      answer:
        'Vi kan hjælpe med udskiftning af eksisterende indendørs, normaltætte afbrydere til højst 250 V, når de konkrete forhold tillader arbejde uden autorisation. Nye afbryderplaceringer og større indgreb er ikke omfattet. Vi afklarer produkt, belastning og installation på forhånd.',
    },
    {
      question: 'Kan alle pærer og lamper dæmpes?',
      answer:
        'Vi lover ikke dæmpning af alt udstyr. Lyskilde og styring skal være kompatible og beregnet til funktionen. Send os gerne mærke og model, så vi kan afklare mulighederne.',
    },
    {
      question: 'Kan jeg ændre tidsplanen eller indstillingerne selv?',
      answer:
        'Vi gennemgår de aftalte funktioner sammen med dig og viser, hvor de relevante indstillinger findes. Vi aftaler betjeningen ud fra det udstyr, løsningen bruger.',
    },
    {
      question: 'Hvad koster lysstyring og sensorer?',
      answer:
        'Prisen afhænger af udstyret, antallet af rum og de funktioner, vi aftaler. Materialer og eventuelt nyt udstyr betales separat. Du kan også søge om at blive et af vores udvalgte pilotprojekter.',
    },
  ],
};
