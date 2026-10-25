// phase 1: define the strict TypeScript contract matching Python ETL output
export interface Project {
  ID: string;
  COUNTRY: string;
  PROJECT: string;
  "OPPORTUNITY LINK": string | null;
  PROVIDER?: string | null;
  "JOB DESCRIPTION"?: string | null;
  BOOKLET?: string | null;
  ACCOMMODATION?: string | null;
  ACCOMODATION?: string | null;
  MEALS?: string | null;
  TRANSPORTATION?: string | null;
  FEE?: string | number | null;
  DURATION?: string | null;
  TIMELINE?: string | null;
  REQUIREMENTS?: string | null;
  // normalized fields injected by Python ETL for fast filtering & sorting
  SDG: number | null;
  FEE_NUMERIC: number | null;
  DURATION_WEEKS: number | null;
  ACCOMMODATION_BOOL: boolean;
}