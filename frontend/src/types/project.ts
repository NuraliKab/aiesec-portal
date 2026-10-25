// phase 1: define the strict TypeScript contract matching Python ETL output
// raw spreadsheet cells pass through openpyxl untouched except for:
//   - strings trimmed (empty -> null), dates/times serialized to ISO strings
//   - header spelling variants canonicalized ("ACCOMODATION" -> "ACCOMMODATION",
//     "TIMELINE OPEN" -> "TIMELINE"), so a single key exists per concept
// any raw cell may therefore be a string, a number (numeric Excel cell), or null
export type RawCell = string | number | null;

export interface Project {
  // phase 2: identity fields injected by the ETL (always present)
  ID: string;
  COUNTRY: string;
  PROJECT: string;
  "OPPORTUNITY LINK": string | null;
  BOOKLET: string | null;

  // phase 3: raw spreadsheet columns (optional: not every LC tab has every column)
  PROVIDER?: RawCell;
  "JOB DESCRIPTION"?: RawCell;
  ACCOMMODATION?: RawCell;
  MEALS?: RawCell;
  TRANSPORTATION?: RawCell;
  FEE?: RawCell;
  DURATION?: RawCell;
  TIMELINE?: RawCell;
  "FLEXIBLE?"?: RawCell;
  "EXTRA INFO"?: RawCell;
  REQUIREMENTS?: RawCell;
  TESTIMONIAL?: RawCell;

  // phase 4: normalized primitives injected by Python ETL for fast filtering & sorting
  SDG: number | null;
  FEE_NUMERIC: number | null;
  DURATION_WEEKS: number | null;
  ACCOMMODATION_BOOL: boolean;
}