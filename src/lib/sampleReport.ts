// Hardcoded demo data for parcel 63902:001:0751 (Vahtrepa, Hiiumaa).
// Real values pulled from EELIS / Maa-amet KMA / Riigi Teataja.
// NOTE: this lives in the UI tree on purpose. The real engine will land in
// /lib (owned by the system side); when ready, swap the import in page.tsx.
// Keeping mock data out of /lib avoids any git merge conflict between sides.

export type Severity = "red" | "amber" | "green";

export interface Restriction {
  category: string; // e.g. "Looduskaitse"
  title: string; // e.g. "Kaitseala piiranguvöönd"
  area: string; // e.g. "Vahtrepa MKA"
  areaM2: number;
  coveragePct: number; // share of parcel covered
  severity: Severity;
  rule?: string;
  ruleUrl?: string;
  cardUrl?: string;
  taxRelief?: number;
}

export interface Species {
  group: "animal" | "plant" | "fungi";
  latin: string;
  et: string;
  kind: string; // e.g. "Liblikalised", "Katteseemnetaimed"
}

export interface RuleDoc {
  title: string;
  url: string;
  issuer: string;
  date: string;
}

export interface ParcelReport {
  tunnus: string;
  address: string;
  municipality: string;
  county: string;
  useType: string;
  areaM2: number;
  forestM2: number;
  grassM2: number;
  otherM2: number;
  owner: string;
  taxValue: number;
  registry: string;
  overall: Severity;
  geometry: { type: "Polygon"; coordinates: number[][][] };
  center: [number, number];
  restrictions: Restriction[];
  species: Species[];
  speciesTotal: number;
  forestStands: number;
  fellingNotices: number;
  ruleDocs: RuleDoc[];
  summary: {
    allowed: string[];
    forbidden: string[];
    consider: string[];
  };
  eco?: {
    score: number; // 0–100, higher = ecologically richer / lower risk
    good: string[]; // one short line each
    concerning: string[]; // one short line each
  };
  // Protection zone from the EELIS sweep (reservaat / sihtkaitsevöönd /
  // piiranguvöönd). Decides forest-management rights; the kitsendused API only
  // names the kaitseala, not the zone, so we surface this separately.
  zone?: string | null;
}

export const sampleReport: ParcelReport = {
  tunnus: "63902:001:0751",
  address: "Uue-Tooma",
  municipality: "Hilleste küla, Hiiumaa vald",
  county: "Hiiu maakond",
  useType: "Maatulundusmaa",
  areaM2: 243697,
  forestM2: 192557,
  grassM2: 33274,
  otherM2: 17866,
  owner: "Eraomand",
  taxValue: 13075,
  registry: "88333",
  overall: "red",
  center: [22.9722, 58.8956],
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [22.96733491, 58.89640764],
        [22.9689436, 58.89549609],
        [22.97248602, 58.89365448],
        [22.97365588, 58.89198624],
        [22.97443809, 58.88844482],
        [22.975717, 58.88861521],
        [22.9751024, 58.89271779],
        [22.97486737, 58.89423819],
        [22.97467822, 58.89424567],
        [22.97380716, 58.89662211],
        [22.97282327, 58.89936523],
        [22.97217855, 58.90118542],
        [22.9713938, 58.90101865],
        [22.96915754, 58.89847489],
        [22.96733491, 58.89640764],
      ],
    ],
  },
  restrictions: [
    {
      category: "Looduskaitse",
      title: "Kaitseala piiranguvöönd",
      area: "Vahtrepa maastikukaitseala",
      areaM2: 243207,
      coveragePct: 100,
      severity: "red",
      rule: "Vahtrepa maastikukaitseala kaitse-eeskiri",
      ruleUrl: "https://www.riigiteataja.ee/akt/105072023204",
      cardUrl: "https://kitsendused.kataster.ee/public?vid=KLO1000238",
    },
    {
      category: "Looduskaitse",
      title: "Hoiuala",
      area: "Pühalepa hoiuala",
      areaM2: 2,
      coveragePct: 0.001,
      severity: "amber",
      taxRelief: 50,
      rule: "Looduskaitseseadus § 4, 14–17, 20, 32, 33",
      ruleUrl: "https://www.riigiteataja.ee/akt/110072020057?leiaKehtiv",
      cardUrl: "https://kitsendused.kataster.ee/public?vid=KLO2000045",
    },
  ],
  species: [
    { group: "animal", latin: "Coenonympha hero", et: "vareskaera-aasasilmik", kind: "Liblikalised" },
    { group: "plant", latin: "Dactylorhiza incarnata", et: "kahkjaspunane sõrmkäpp", kind: "Käpalised" },
    { group: "plant", latin: "Epipactis palustris", et: "soo-neiuvaip", kind: "Käpalised" },
    { group: "plant", latin: "Platanthera chlorantha", et: "rohekas käokeel", kind: "Käpalised" },
    { group: "plant", latin: "Gymnadenia conopsea", et: "harilik käoraamat", kind: "Käpalised" },
    { group: "plant", latin: "Orchis militaris", et: "hall käpp", kind: "Käpalised" },
    { group: "plant", latin: "Dactylorhiza incarnata subsp. ochroleuca", et: "kollakas sõrmkäpp", kind: "Käpalised" },
    { group: "plant", latin: "Epipactis palustris", et: "soo-neiuvaip", kind: "Käpalised" },
  ],
  speciesTotal: 12,
  forestStands: 35,
  fellingNotices: 0,
  ruleDocs: [
    {
      title: "Vahtrepa maastikukaitseala kaitse-eeskiri",
      url: "https://www.riigiteataja.ee/akt/105072023204",
      issuer: "Vabariigi Valitsus",
      date: "2023-07-08",
    },
  ],
  summary: {
    allowed: [
      "Tavapärane majandustegevus piiranguvööndi reeglite piires",
      "Jahipidamine",
      "Olemasolevate ehitiste hooldus ja kasutamine",
    ],
    forbidden: [
      "Uuendusraie ilma Keskkonnaameti kooskõlastuseta",
      "Kaitsealuste liikide kasvukohtade kahjustamine",
      "Maa kuivendamine ja veerežiimi muutmine",
    ],
    consider: [
      "Kogu kinnistu (100%) asub Vahtrepa kaitseala piiranguvööndis",
      "Kinnistul on 12 III kategooria kaitsealust liiki (peamiselt käpalised)",
      "Hoiuala servas — 50% maamaksu soodustus",
    ],
  },
  eco: {
    score: 68,
    good: [
      "Asub kaitsealal — elurikkus tavaliselt paremas seisus.",
      "Üleeuroopalise tähtsusega märgala-elupaigad.",
      "Natura 2000 väärtuslik elupaik läheduses.",
    ],
    concerning: [
      "Lähedased kuivenduskraavid mõjutavad märgala veerežiimi.",
      "Turvasmuldade kuivendamine on suur CO₂ allikas.",
    ],
  },
};
