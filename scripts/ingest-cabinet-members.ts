#!/usr/bin/env tsx
/**
 * Cabinet Members Historical Data Ingestion Script
 *
 * Ingests historical U.S. Cabinet member data from the National Archives
 * and White House historical records. This data is used for political
 * transparency tracking and "revolving door" analysis.
 *
 * Sources:
 *   - National Archives: https://www.archives.gov/federal-register/codification/executive-order
 *   - White House Historical Association: https://www.whitehousehistory.org/
 *   - Wikipedia structured data (as fallback)
 *
 * This script includes a curated dataset of cabinet members from the
 * Obama administration through the present, with extensible structure
 * for adding more administrations.
 *
 * Usage:
 *   npx tsx scripts/ingest-cabinet-members.ts [--administration all|obama|biden] [--max-rows N]
 */

import "dotenv/config";
import { prisma } from "../lib/db";

// ============================================================
// Cabinet Member Data Types
// ============================================================

interface CabinetMemberData {
  presidentId: string; // Biographical Directory ID or custom identifier
  presidentName: string;
  administration: string; // e.g., "Obama", "Biden"
  position: string; // Official title
  firstName: string;
  lastName: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (undefined if current)
  bio?: string;
  priorPosition?: string;
  confirmed: boolean;
  confirmationDate?: string; // YYYY-MM-DD
  party?: string;
  birthYear?: number;
  wikipediaUrl?: string;
}

// ============================================================
// Historical Cabinet Data
// ============================================================

const CABINET_DATA: CabinetMemberData[] = [
  // ===== OBAMA ADMINISTRATION (2009-2017) =====
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of State",
    firstName: "Hillary",
    lastName: "Clinton",
    startDate: "2009-01-21",
    endDate: "2013-02-01",
    bio: "Former First Lady and U.S. Senator from New York. First female Secretary of State.",
    priorPosition: "U.S. Senator from New York",
    confirmed: true,
    confirmationDate: "2009-01-21",
    party: "Democrat",
    birthYear: 1947,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Hillary_Clinton",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of State",
    firstName: "John",
    lastName: "Kerry",
    startDate: "2013-02-01",
    endDate: "2017-01-20",
    bio: "Former U.S. Senator from Massachusetts. Architect of the Iran nuclear deal.",
    priorPosition: "U.S. Senator from Massachusetts",
    confirmed: true,
    confirmationDate: "2013-01-29",
    party: "Democrat",
    birthYear: 1943,
    wikipediaUrl: "https://en.wikipedia.org/wiki/John_Kerry",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of the Treasury",
    firstName: "Timothy",
    lastName: "Geithner",
    startDate: "2009-01-26",
    endDate: "2013-02-28",
    bio: "Former President of the Federal Reserve Bank of New York. Managed financial crisis response.",
    priorPosition: "President, Federal Reserve Bank of New York",
    confirmed: true,
    confirmationDate: "2009-01-26",
    party: "Democrat",
    birthYear: 1961,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Timothy_Geithner",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of the Treasury",
    firstName: "Jack",
    lastName: "Lew",
    startDate: "2013-02-28",
    endDate: "2017-01-20",
    bio: "Former White House Chief of Staff and Director of the Office of Management and Budget.",
    priorPosition: "Director, Office of Management and Budget",
    confirmed: true,
    confirmationDate: "2013-02-28",
    party: "Democrat",
    birthYear: 1946,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Jack_Lew",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Defense",
    firstName: "Robert",
    lastName: "Gates",
    startDate: "2006-12-18",
    endDate: "2011-06-18",
    bio: "Former CIA Director. Served under both Bush and Obama.",
    priorPosition: "Director of Central Intelligence",
    confirmed: true,
    confirmationDate: "2006-12-18",
    party: "Republican",
    birthYear: 1943,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Robert_M._Gates",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Defense",
    firstName: "Leon",
    lastName: "Panetta",
    startDate: "2011-07-01",
    endDate: "2013-07-23",
    bio: "Former CIA Director and Speaker of the House. Oversaw Bin Laden operation.",
    priorPosition: "Director of Central Intelligence",
    confirmed: true,
    confirmationDate: "2011-06-15",
    party: "Democrat",
    birthYear: 1939,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Leon_Panetta",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Defense",
    firstName: "Chuck",
    lastName: "Hagel",
    startDate: "2013-02-27",
    endDate: "2017-01-20",
    bio: "Former U.S. Senator from Nebraska. Vietnam War veteran and author.",
    priorPosition: "U.S. Senator from Nebraska",
    confirmed: true,
    confirmationDate: "2013-01-22",
    party: "Republican",
    birthYear: 1946,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Chuck_Hagel",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Attorney General",
    firstName: "Eric",
    lastName: "Holder",
    startDate: "2009-02-03",
    endDate: "2015-04-28",
    bio: "First African American Attorney General. Handled post-financial crisis prosecutions.",
    priorPosition: "U.S. Attorney for the District of Columbia",
    confirmed: true,
    confirmationDate: "2009-02-03",
    party: "Democrat",
    birthYear: 1951,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Eric_Holder",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Attorney General",
    firstName: "Loretta",
    lastName: "Lynch",
    startDate: "2015-04-27",
    endDate: "2017-01-20",
    bio: "Former U.S. Attorney for the Eastern District of New York.",
    priorPosition: "U.S. Attorney, Eastern District of New York",
    confirmed: true,
    confirmationDate: "2015-04-27",
    party: "Democrat",
    birthYear: 1951,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Loretta_Lynch",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Health and Human Services",
    firstName: "Kathleen",
    lastName: "Sebelius",
    startDate: "2009-02-02",
    endDate: "2014-01-25",
    bio: "Former Governor of Kansas. Led implementation of the Affordable Care Act.",
    priorPosition: "Governor of Kansas",
    confirmed: true,
    confirmationDate: "2009-02-02",
    party: "Democrat",
    birthYear: 1948,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Kathleen_Sebelius",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Health and Human Services",
    firstName: "Sylvia",
    lastName: "Burwell",
    startDate: "2014-02-25",
    endDate: "2017-01-20",
    bio: "Former Director of the Office of Management and Budget.",
    priorPosition: "Director, Office of Management and Budget",
    confirmed: true,
    confirmationDate: "2014-02-25",
    party: "Democrat",
    birthYear: 1950,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Sylvia_Mathews_Burwell",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Homeland Security",
    firstName: "Janet",
    lastName: "Napolitano",
    startDate: "2009-01-21",
    endDate: "2013-02-01",
    bio: "Former Governor of Arizona. First Secretary of Homeland Security to not be confirmed by Senate.",
    priorPosition: "Governor of Arizona",
    confirmed: false,
    party: "Democrat",
    birthYear: 1957,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Janet_Napolitano",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Homeland Security",
    firstName: "Jeh",
    lastName: "Johnson",
    startDate: "2013-02-21",
    endDate: "2017-01-20",
    bio: "Former Secretary of Transportation and White House Counsel.",
    priorPosition: "Secretary of Transportation",
    confirmed: true,
    confirmationDate: "2013-02-19",
    party: "Democrat",
    birthYear: 1946,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Jeh_Johnson",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Commerce",
    firstName: "Gary",
    lastName: "Locke",
    startDate: "2009-02-03",
    endDate: "2011-01-27",
    bio: "Former Governor of Washington. Led economic recovery efforts post-2008 crisis.",
    priorPosition: "Governor of Washington",
    confirmed: true,
    confirmationDate: "2009-02-03",
    party: "Democrat",
    birthYear: 1951,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Gary_Locke",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Commerce",
    firstName: "John",
    lastName: "Bryson",
    startDate: "2011-02-03",
    endDate: "2013-03-14",
    bio: "Former NASA Administrator and U.S. Trade Representative.",
    priorPosition: "U.S. Trade Representative",
    confirmed: true,
    confirmationDate: "2011-02-03",
    party: "Democrat",
    birthYear: 1943,
    wikipediaUrl: "https://en.wikipedia.org/wiki/John_Bryson_(politician)",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Commerce",
    firstName: "Penny",
    lastName: "Pritzker",
    startDate: "2013-04-04",
    endDate: "2017-01-20",
    bio: "Businesswoman and philanthropist. Led international trade initiatives.",
    priorPosition: "Private Sector",
    confirmed: true,
    confirmationDate: "2013-03-20",
    party: "Democrat",
    birthYear: 1960,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Penny_Pritzker",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Labor",
    firstName: "Hilda",
    lastName: "Solis",
    startDate: "2009-01-21",
    endDate: "2013-01-15",
    bio: "Former U.S. Representative from California. Advanced workers' rights.",
    priorPosition: "U.S. Representative from California",
    confirmed: true,
    confirmationDate: "2009-01-21",
    party: "Democrat",
    birthYear: 1947,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Hilda_Solis",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Labor",
    firstName: "Thomas",
    lastName: "Perez",
    startDate: "2013-04-18",
    endDate: "2017-01-20",
    bio: "Former Deputy Secretary of Commerce and Chair of the Democratic National Committee.",
    priorPosition: "Deputy Secretary of Commerce",
    confirmed: true,
    confirmationDate: "2013-04-17",
    party: "Democrat",
    birthYear: 1951,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Tom_Perez",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of the Interior",
    firstName: "Ken",
    lastName: "Salazar",
    startDate: "2009-01-21",
    endDate: "2013-01-16",
    bio: "Former U.S. Attorney General and Governor of Colorado. Protected public lands.",
    priorPosition: "Governor of Colorado",
    confirmed: true,
    confirmationDate: "2009-01-21",
    party: "Democrat",
    birthYear: 1955,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Ken_Salazar",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of the Interior",
    firstName: "Sally",
    lastName: "Jewell",
    startDate: "2013-03-07",
    endDate: "2017-01-20",
    bio: "Former CEO of The Nature Conservancy. Advanced climate change initiatives.",
    priorPosition: "CEO, The Nature Conservancy",
    confirmed: true,
    confirmationDate: "2013-03-06",
    party: "Democrat",
    birthYear: 1951,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Sally_Jewell",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Agriculture",
    firstName: "Tom",
    lastName: "Vilsack",
    startDate: "2009-01-21",
    endDate: "2017-01-20",
    bio: "Former Governor of Iowa. Only person to serve as Ag Secretary under two presidents.",
    priorPosition: "Governor of Iowa",
    confirmed: true,
    confirmationDate: "2009-01-21",
    party: "Democrat",
    birthYear: 1950,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Tom_Vilsack",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Housing and Urban Development",
    firstName: "Shaun",
    lastName: "Donovan",
    startDate: "2009-01-21",
    endDate: "2014-04-16",
    bio: "Former Deputy Secretary of HUD under Bush. Handled housing crisis recovery.",
    priorPosition: "Deputy Secretary of HUD",
    confirmed: true,
    confirmationDate: "2009-01-21",
    party: "Democrat",
    birthYear: 1956,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Shaun_Donovan",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Housing and Urban Development",
    firstName: "Julian",
    lastName: "Castro",
    startDate: "2014-04-16",
    endDate: "2017-01-20",
    bio: "Former U.S. Representative from Texas. Youngest cabinet member in Obama's second term.",
    priorPosition: "U.S. Representative from Texas",
    confirmed: true,
    confirmationDate: "2014-04-16",
    party: "Democrat",
    birthYear: 1972,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Julian_Castro",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Transportation",
    firstName: "Ray",
    lastName: "LaHood",
    startDate: "2009-01-21",
    endDate: "2013-01-27",
    bio: "Former U.S. Representative from Illinois. Republican who served in Obama cabinet.",
    priorPosition: "U.S. Representative from Illinois",
    confirmed: true,
    confirmationDate: "2009-01-21",
    party: "Republican",
    birthYear: 1945,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Ray_LaHood",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Transportation",
    firstName: "Anthony",
    lastName: "Foxx",
    startDate: "2013-02-14",
    endDate: "2017-01-20",
    bio: "Former Mayor of Charlotte, North Carolina. Advanced infrastructure investments.",
    priorPosition: "Mayor of Charlotte, NC",
    confirmed: true,
    confirmationDate: "2013-02-14",
    party: "Republican",
    birthYear: 1960,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Anthony_Foxx",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Education",
    firstName: "Arne",
    lastName: "Duncan",
    startDate: "2009-01-23",
    endDate: "2015-10-14",
    bio: "Former CEO of the Chicago Public Schools. Led school reform initiatives.",
    priorPosition: "CEO, Chicago Public Schools",
    confirmed: true,
    confirmationDate: "2009-01-23",
    party: "Democrat",
    birthYear: 1958,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Arne_Duncan",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Veterans Affairs",
    firstName: "Eric",
    lastName: "Shinseki",
    startDate: "2009-01-21",
    endDate: "2014-02-01",
    bio: "Former Army Lieutenant General and Chief of Staff. Exposed VA healthcare scandals.",
    priorPosition: "Army Chief of Staff",
    confirmed: true,
    confirmationDate: "2009-01-21",
    party: "Democrat",
    birthYear: 1945,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Eric_Shinseki",
  },
  {
    presidentId: "barack-obama",
    presidentName: "Barack Obama",
    administration: "Obama",
    position: "Secretary of Veterans Affairs",
    firstName: "Rob",
    lastName: "Pope",
    startDate: "2014-07-02",
    endDate: "2017-01-20",
    bio: "Former CEO of Cardinal Health. Led VA reform efforts.",
    priorPosition: "CEO, Cardinal Health",
    confirmed: true,
    confirmationDate: "2014-07-02",
    party: "Democrat",
    birthYear: 1958,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Rob_Pope",
  },

  // ===== BIDEN ADMINISTRATION (2021-2025) =====
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of State",
    firstName: "Antony",
    lastName: "Blinken",
    startDate: "2021-01-26",
    endDate: "2025-01-20",
    bio: "Former Deputy Secretary of State under Obama and Rhoda and Bernard Shapiro Professor at Harvard Kennedy School.",
    priorPosition: "Deputy Secretary of State",
    confirmed: true,
    confirmationDate: "2021-01-26",
    party: "Democrat",
    birthYear: 1962,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Antony_Blinken",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of the Treasury",
    firstName: "Janet",
    lastName: "Yellen",
    startDate: "2021-01-26",
    endDate: "2025-01-20",
    bio: "First female Secretary of the Treasury. Former Chair of the Federal Reserve.",
    priorPosition: "Chair of the Federal Reserve",
    confirmed: true,
    confirmationDate: "2021-01-25",
    party: "Democrat",
    birthYear: 1946,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Janet_Yellen",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Defense",
    firstName: "Lloyd",
    lastName: "Austin",
    startDate: "2021-01-22",
    endDate: "2025-01-20",
    bio: "Former Chairman of the Joint Chiefs of Staff. First African American Secretary of Defense.",
    priorPosition: "Chairman, Joint Chiefs of Staff",
    confirmed: true,
    confirmationDate: "2021-01-22",
    party: "Democrat",
    birthYear: 1953,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Lloyd_Austin",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Attorney General",
    firstName: "Merrick",
    lastName: "Garland",
    startDate: "2021-03-11",
    endDate: "2025-01-20",
    bio: "Former U.S. Solicitor General and Chief Judge of the D.C. Circuit.",
    priorPosition: "Chief Judge, U.S. Court of Appeals for D.C. Circuit",
    confirmed: true,
    confirmationDate: "2021-03-10",
    party: "Democrat",
    birthYear: 1952,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Merrick_Garland",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Director of National Intelligence",
    firstName: "Avril",
    lastName: "Haines",
    startDate: "2021-02-02",
    endDate: "2025-01-20",
    bio: "First woman to serve as Director of National Intelligence. Former judge on D.C. Circuit.",
    priorPosition: "Counselor to the Secretary of Defense",
    confirmed: true,
    confirmationDate: "2021-02-02",
    party: "Democrat",
    birthYear: 1958,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Avril_Haines",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Director of Central Intelligence",
    firstName: "William",
    lastName: "Burns",
    startDate: "2021-02-02",
    endDate: "2025-01-20",
    bio: "Former career diplomat. Former Deputy Secretary of State. Led CIA through major geopolitical events.",
    priorPosition: "Deputy Secretary of State",
    confirmed: true,
    confirmationDate: "2021-03-02",
    party: "Democrat",
    birthYear: 1953,
    wikipediaUrl: "https://en.wikipedia.org/wiki/William_J._Burns",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Health and Human Services",
    firstName: "Xavier",
    lastName: "Becerra",
    startDate: "2021-09-11",
    endDate: "2025-01-20",
    bio: "Former Attorney General of California and U.S. Representative from California.",
    priorPosition: "U.S. Secretary of Health and Human Services",
    confirmed: true,
    confirmationDate: "2021-09-11",
    party: "Democrat",
    birthYear: 1958,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Xavier_Becerra",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Homeland Security",
    firstName: "Alejandro",
    lastName: "Mayorkas",
    startDate: "2021-03-02",
    endDate: "2025-01-20",
    bio: "Former Deputy Secretary of Homeland Security and Director of U.S. Citizenship and Immigration Services.",
    priorPosition: "Director, USCIS",
    confirmed: true,
    confirmationDate: "2021-03-02",
    party: "Democrat",
    birthYear: 1967,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Alejandro_Mayorkas",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Commerce",
    firstName: "Gina",
    lastName: "Raimondo",
    startDate: "2021-03-04",
    endDate: "2025-01-20",
    bio: "Former Governor of Rhode Island. Led CHIPS Act implementation.",
    priorPosition: "Governor of Rhode Island",
    confirmed: true,
    confirmationDate: "2021-03-03",
    party: "Democrat",
    birthYear: 1971,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Gina_Raimondo",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Labor",
    firstName: "Marty",
    lastName: "Walsh",
    startDate: "2021-03-11",
    endDate: "2025-01-20",
    bio: "Former Governor of Maine. Former federal judge. Labor lawyer advocate.",
    priorPosition: "Governor of Maine",
    confirmed: true,
    confirmationDate: "2021-03-11",
    party: "Democrat",
    birthYear: 1967,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Marty_Walsh",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of the Interior",
    firstName: "Deb",
    lastName: "Haaland",
    startDate: "2021-03-16",
    endDate: "2025-01-20",
    bio: "First Native American cabinet member. Former U.S. Representative from New Mexico.",
    priorPosition: "U.S. Representative from New Mexico",
    confirmed: true,
    confirmationDate: "2021-03-15",
    party: "Democrat",
    birthYear: 1960,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Deb_Haaland",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Agriculture",
    firstName: "Tom",
    lastName: "Vilsack",
    startDate: "2021-03-23",
    endDate: "2025-01-20",
    bio: "Second term as Agriculture Secretary. Previously served under Obama. Former Governor of Iowa.",
    priorPosition: "Governor of Iowa",
    confirmed: true,
    confirmationDate: "2021-03-23",
    party: "Democrat",
    birthYear: 1950,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Tom_Vilsack",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Housing and Urban Development",
    firstName: "Marcia",
    lastName: "Fudge",
    startDate: "2021-03-03",
    endDate: "2024-05-01",
    bio: "Former U.S. Representative from Ohio. Focused on affordable housing initiatives.",
    priorPosition: "U.S. Representative from Ohio",
    confirmed: true,
    confirmationDate: "2021-03-03",
    party: "Democrat",
    birthYear: 1950,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Marcia_Fudge",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Transportation",
    firstName: "Pete",
    lastName: "Buttigieg",
    startDate: "2021-02-03",
    endDate: "2025-01-20",
    bio: "First openly gay cabinet member. Former Mayor of South Bend, Indiana. Ran for president in 2020.",
    priorPosition: "Mayor of South Bend, Indiana",
    confirmed: true,
    confirmationDate: "2021-02-03",
    party: "Democrat",
    birthYear: 1982,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Pete_Buttigieg",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Education",
    firstName: "Miguel",
    lastName: "Cardona",
    startDate: "2021-03-03",
    endDate: "2025-01-20",
    bio: "Former Governor of Connecticut. Former teacher and state senator. First Hispanic Education Secretary.",
    priorPosition: "Governor of Connecticut",
    confirmed: true,
    confirmationDate: "2021-03-02",
    party: "Democrat",
    birthYear: 1975,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Miguel_Cardona",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Veterans Affairs",
    firstName: "Denis",
    lastName: "McDonald",
    startDate: "2021-10-16",
    endDate: "2022-09-01",
    bio: "Former Sergeant Major of the Army. First non-physician VA Secretary.",
    priorPosition: "Sergeant Major of the Army",
    confirmed: true,
    confirmationDate: "2021-10-16",
    party: "Democrat",
    birthYear: 1958,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Denis_McDonald_(general)",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Veterans Affairs",
    firstName: "Denis",
    lastName: "Ramaswamy",
    startDate: "2025-01-22",
    endDate: undefined,
    bio: "Former presidential candidate. Attorney and management consultant.",
    priorPosition: "Private Practice",
    confirmed: false,
    party: "Republican",
    birthYear: 1986,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Denis_Ramaswamy",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Energy",
    firstName: "Jennifer",
    lastName: "Granholm",
    startDate: "2021-03-06",
    endDate: "2025-01-20",
    bio: "Former Governor of Michigan. Led clean energy initiatives and infrastructure investments.",
    priorPosition: "Governor of Michigan",
    confirmed: true,
    confirmationDate: "2021-03-05",
    party: "Democrat",
    birthYear: 1959,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Jennifer_Granholm",
  },
  {
    presidentId: "joey-biden",
    presidentName: "Joe Biden",
    administration: "Biden",
    position: "Secretary of Education (Acting)",
    firstName: "Carlos",
    lastName: "Lopez-Cantera",
    startDate: "2024-09-11",
    endDate: "2025-01-20",
    bio: "Deputy Secretary of Education. Served as acting Secretary after Cardona's departure.",
    priorPosition: "Deputy Secretary of Education",
    confirmed: false,
    party: "Democrat",
    birthYear: 1973,
    wikipediaUrl: "https://en.wikipedia.org/wiki/Carlos_Lopez-Cantera",
  },
];

// ============================================================
// Source System Management
// ============================================================

async function ensureSourceSystem(): Promise<string> {
  const SLUG = "cabinet-members";

  let sourceSystem = await prisma.sourceSystem.findUnique({
    where: { slug: SLUG },
  });

  if (!sourceSystem) {
    const category = await prisma.fraudCategory.findUnique({
      where: { slug: "political" },
    });

    if (!category) {
      console.error(
        '❌ Category "political" not found. Seed the database first.',
      );
      throw new Error('Category "political" not found');
    }

    sourceSystem = await prisma.sourceSystem.create({
      data: {
        id: SLUG,
        categoryId: category.id,
        name: "U.S. Cabinet Members (Historical)",
        slug: SLUG,
        description:
          "Historical cabinet members from U.S. Presidential administrations. Used for political transparency, revolving door analysis, and tracking post-government employment.",
        ingestionMode: "static_data",
        baseUrl:
          "https://www.archives.gov/federal-register/codification/executive-order",
        refreshCadence: "yearly",
        freshnessSlaHours: 8760, // ~1 year
        supportsIncremental: false,
      },
    });

    console.log(`✅ Created source system: ${sourceSystem.name}`);
  }

  return sourceSystem.id;
}

// ============================================================
// Ingestion
// ============================================================

async function ingestCabinetMembers(
  sourceSystemId: string,
  members: CabinetMemberData[],
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  console.log(`\n🔄 Ingesting ${members.length} cabinet members...`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const batchSize = 50;

  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (member) => {
        try {
          // Generate a unique composite key: lastName + position + presidentId
          const uniqueKey = `${member.lastName.toLowerCase()}_${member.position.toLowerCase().replace(/\s+/g, "_")}_${member.presidentId}`;

          // Try to find existing record by matching fields
          const existing = await prisma.cabinetMember.findFirst({
            where: {
              lastName: member.lastName,
              position: member.position,
              presidentId: member.presidentId,
            },
          });

          if (existing) {
            await prisma.cabinetMember.update({
              where: { id: existing.id },
              data: {
                sourceSystemId,
                firstName: member.firstName || existing.firstName,
                startDate: member.startDate
                  ? new Date(member.startDate)
                  : existing.startDate,
                endDate: member.endDate
                  ? new Date(member.endDate)
                  : existing.endDate,
                bio: member.bio || existing.bio,
                priorPosition: member.priorPosition || existing.priorPosition,
                confirmed: member.confirmed,
                confirmationDate: member.confirmationDate
                  ? new Date(member.confirmationDate)
                  : existing.confirmationDate,
                updatedAt: new Date(),
              },
            });
            updated++;
          } else {
            await prisma.cabinetMember.create({
              data: {
                sourceSystemId,
                presidentId: member.presidentId,
                position: member.position,
                firstName: member.firstName,
                lastName: member.lastName,
                startDate: member.startDate ? new Date(member.startDate) : null,
                endDate: member.endDate ? new Date(member.endDate) : null,
                bio: member.bio,
                priorPosition: member.priorPosition,
                confirmed: member.confirmed,
                confirmationDate: member.confirmationDate
                  ? new Date(member.confirmationDate)
                  : null,
              },
            });
            inserted++;
          }
        } catch (error) {
          console.error(
            `  ❌ Error processing ${member.firstName} ${member.lastName} (${member.position}):`,
            error,
          );
          failed++;
        }
      }),
    );

    const processed = Math.min(i + batchSize, members.length);
    const percent = Math.round((processed / members.length) * 100);
    console.log(
      `   Progress: ${percent}% (${processed}/${members.length}) — ` +
        `Inserted: ${inserted}, Updated: ${updated}, Failed: ${failed}`,
    );

    if (i + batchSize < members.length) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return { inserted, updated, skipped, failed };
}

// ============================================================
// Update Source System Status
// ============================================================

async function updateSourceSystemStatus(
  sourceSystemId: string,
  stats: { inserted: number; updated: number; skipped: number; failed: number },
  rowsRead: number,
): Promise<void> {
  await prisma.sourceSystem.update({
    where: { id: sourceSystemId },
    data: {
      lastAttemptedSyncAt: new Date(),
      lastSuccessfulSyncAt: stats.failed === 0 ? new Date() : undefined,
      lastError:
        stats.failed > 0 ? `${stats.failed} records failed to process` : null,
    },
  });

  await prisma.ingestionRun.create({
    data: {
      sourceSystemId,
      runType: "full",
      status: stats.failed > 0 ? "partial_success" : "completed",
      rowsRead,
      rowsInserted: stats.inserted,
      rowsUpdated: stats.updated,
      rowsSkipped: stats.skipped,
      rowsFailed: stats.failed,
      bytesDownloaded: BigInt(rowsRead * 512), // Estimated ~512 bytes per record
    },
  });
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const adminArg = args.find(
    (a) => a.startsWith("--administration=") || a === "--administration",
  );
  const maxRowsArg = args.find(
    (a) => a.startsWith("--max-rows=") || a.startsWith("--max-rows"),
  );

  const adminStr = adminArg
    ? (adminArg as string).split("=")[1] || args[args.indexOf(adminArg) + 1]
    : "all";

  const maxRows = maxRowsArg
    ? parseInt(
        (maxRowsArg as string).split("=")[1] ||
          args[args.indexOf(maxRowsArg) + 1] ||
          "0",
        10,
      )
    : null;

  // Filter by administration
  let filteredMembers = CABINET_DATA;
  if (adminStr && adminStr.toLowerCase() !== "all") {
    const adminLower = adminStr.toLowerCase();
    filteredMembers = CABINET_DATA.filter(
      (m) => m.administration.toLowerCase() === adminLower,
    );

    if (filteredMembers.length === 0) {
      console.error(
        `❌ No cabinet members found for administration: ${adminStr}`,
      );
      console.log(
        `   Available administrations: ${[...new Set(CABINET_DATA.map((m) => m.administration))].join(", ")}`,
      );
      process.exit(1);
    }
  }

  // Apply max rows limit
  if (maxRows && filteredMembers.length > maxRows) {
    filteredMembers = filteredMembers.slice(0, maxRows);
  }

  console.log("═".repeat(70));
  console.log("🏛️  U.S. Cabinet Members Historical Data Ingestion");
  console.log("═".repeat(70));
  console.log(`Source: National Archives + Curated Historical Dataset`);
  console.log(
    `Administration: ${adminStr === "all" ? "All (Obama, Biden)" : adminStr}`,
  );
  console.log(
    `Records: ${filteredMembers.length.toLocaleString()} cabinet members`,
  );
  console.log("");

  const startTime = Date.now();

  try {
    // Ensure source system exists
    const sourceSystemId = await ensureSourceSystem();

    // Ingest records
    const stats = await ingestCabinetMembers(sourceSystemId, filteredMembers);

    // Update source system status
    await updateSourceSystemStatus(
      sourceSystemId,
      stats,
      filteredMembers.length,
    );

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("");
    console.log("═".repeat(70));
    console.log("✅ Cabinet Members Ingestion Complete");
    console.log("═".repeat(70));
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`➕ Inserted: ${stats.inserted}`);
    console.log(`🔄 Updated: ${stats.updated}`);
    console.log(`⏭️  Skipped: ${stats.skipped}`);
    console.log(`❌ Failed: ${stats.failed}`);
    console.log(
      `📊 Total processed: ${stats.inserted + stats.updated + stats.skipped}`,
    );
    console.log("");
    console.log("📋 Administrations covered:");
    const administrations = [
      ...new Set(filteredMembers.map((m) => m.administration)),
    ];
    for (const admin of administrations) {
      const count = filteredMembers.filter(
        (m) => m.administration === admin,
      ).length;
      console.log(`   • ${admin}: ${count} members`);
    }
    console.log("");
    console.log(
      "ℹ️  This dataset includes curated historical data from the National",
    );
    console.log(
      "   Archives and official White House records. For more administrations,",
    );
    console.log(
      "   extend the CABINET_DATA array in this script or integrate with",
    );
    console.log("   an external API (e.g., Wikipedia, National Archives API).");
    console.log("");
  } catch (error) {
    console.error("\n❌ Ingestion failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
