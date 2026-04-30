import { csPlural } from "@/lib/i18n/plural";

export const NOUNS = {
  obchod: { one: "obchod", few: "obchody", other: "obchodů" },
  firma: { one: "firma", few: "firmy", other: "firem" },
  kontakt: { one: "kontakt", few: "kontakty", other: "kontaktů" },
  uzivatel: { one: "uživatel", few: "uživatelé", other: "uživatelů" },
  den: { one: "den", few: "dny", other: "dnů" },
  koruna: { one: "koruna", few: "koruny", other: "korun" },
  člen: { one: "člen", few: "členové", other: "členů" },
} as const;

export type CzechNoun = keyof typeof NOUNS;

export function csNoun(n: number, key: CzechNoun): string {
  const forms = NOUNS[key];
  return csPlural(n, forms.one, forms.few, forms.other);
}
