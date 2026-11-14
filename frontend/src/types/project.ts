// one Project = one row of the AIESEC sheet, after scripts/etl_parser.py cleaned it.
// this interface has to match the objects inside src/data/projects.json

// a raw cell is whatever someone typed into the sheet:
// text ("75 EUR"), a number (104.2) or nothing (null)
export type RawCell = string | number | null;

export interface Project {
  // phase 1: fields made or cleaned by the python script.
  // these are always there, so the website can filter and sort by them safely
  ID: string; // sheet name + row number, like "Izmir🇹🇷_12"
  COUNTRY: string; // name of the sheet tab the project came from
  PROJECT: string; // project title
  "OPPORTUNITY LINK": string | null; // apply link without the google redirect
  BOOKLET: string | null; // link to the info booklet
  SDG: number | null; // UN goal number, 1 to 17
  FEE_NUMERIC: number | null; // "104,20€" -> 104.2
  DURATION_WEEKS: number | null; // "6 weeks" -> 6
  ACCOMMODATION_BOOL: boolean; // "host families" -> true

  // phase 2: columns copied from the sheet exactly as they were typed.
  // they are optional (?) because not every sheet has every column
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
}
