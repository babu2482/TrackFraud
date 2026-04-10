/**
 * Map NTEE code (e.g. "P20") to ProPublica NTEE major group id (1-10).
 * ProPublica: 1=Arts, 2=Education, 3=Environment, 4=Health, 5=Human Services,
 * 6=International, 7=Public Societal, 8=Religion, 9=Mutual, 10=Unknown.
 * NCCS uses first letter for major group (A=Arts, B=Education, ...).
 */

const LETTER_TO_MAJOR: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  I: 9,
  J: 10,
  K: 10,
  L: 10,
  M: 10,
  N: 10,
  O: 10,
  P: 7,
  Q: 10,
  R: 10,
  S: 10,
  T: 10,
  U: 10,
  V: 10,
  W: 10,
  X: 10,
  Y: 10,
  Z: 10,
};

export function nteeCodeToMajorId(nteeCode: string | undefined): number | null {
  if (!nteeCode || !nteeCode.length) return null;
  const letter = nteeCode.charAt(0).toUpperCase();
  const id = LETTER_TO_MAJOR[letter];
  return id != null ? id : null;
}

export const NTEE_MAJOR_LABELS: Record<number, string> = {
  1: "Arts, Culture & Humanities",
  2: "Education",
  3: "Environment and Animals",
  4: "Health",
  5: "Human Services",
  6: "International, Foreign Affairs",
  7: "Public, Societal Benefit",
  8: "Religion Related",
  9: "Mutual/Membership Benefit",
  10: "Unknown, Unclassified",
};
