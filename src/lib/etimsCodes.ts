// ETIMS form value codes — extracted from the actual LADOT complaint form HTML.
// The form uses short codes as <option value="XX">, not display text.

export const ETIMS_BASE = "https://wmq1.etimspayments.com";

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","MA","MD","ME","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

export const COLOR_CODES: Record<string, string> = {
  BEIGE: "BG", BLACK: "BK", BLUE: "BL", BROWN: "BN", COPPER: "CO",
  GOLD: "GO", GREEN: "GN", GREY: "GY", MAROON: "MR", ORANGE: "OR",
  PURPLE: "PR", RED: "RD", SILVER: "SL", TAN: "TN", TURQUOISE: "TU",
  UNKNOWN: "UN", WHITE: "WT", YELLOW: "YE",
};

export const MAKE_CODES: Record<string, string> = {
  ACURA: "ACUR", "ALFA ROMEO": "ALFA", "ASTON MARTIN": "ASTO", AUBURN: "AUBU",
  AUDI: "AUDI", "AUSTIN HEALY": "AUHE", AVANTI: "AVTI", BENTLEY: "BENT",
  BMW: "BMW", BUGATTI: "BUGA", BUICK: "BUIC", CADILLAC: "CADI",
  CHECKER: "CHEC", CHEVROLET: "CHEV", CHRYSLER: "CHRY", CITROEN: "CITR",
  CUSHMAN: "CUSH", DAEWOO: "DAEW", DAIHATSU: "DAIH", DATSUN: "DATS",
  DODGE: "DODG", DUESENBERG: "DUES", EAGLE: "EGLE", FERRARI: "FERR",
  FIAT: "FIAT", FORD: "FORD", FREIGHTLINER: "FRHT", "GENERAL MOTORS": "GMC",
  GEO: "GEO", GRUMMAN: "GRUM", "HARLEY-DAVIDSON": "HD", HONDA: "HOND",
  HUMMER: "HUMM", HYUNDAI: "HYUN", INDIAN: "IND", INFINITI: "INFI",
  INTERNATIONAL: "INTL", ISUZU: "ISU", IVECCO: "IVEC", JAGUAR: "JAGU",
  JEEP: "JEEP", JENSEN: "JENS", KAWASAKI: "KAWK", KENWORTH: "KW",
  KIA: "KIA", LAMBORGHINI: "LAMO", LANCIA: "LNCI", "LAND ROVER": "LNDR",
  LEXUS: "LEXS", LINCOLN: "LINC", MACK: "MACK", MASERATI: "MASE",
  MAZDA: "MAZD", "MERCEDES BENZ": "MERZ", MERCURY: "MERC", MERKUR: "MERK",
  "MINI COOPER": "MNNI", MITSUBISHI: "MITS", NISSAN: "NISS", OLDSMOBILE: "OLDS",
  OTHER: "OTHR", PACKARD: "PACK", PETERBILT: "PTRB", PEUGOT: "PEUG",
  PLYMOUTH: "PLYM", PONTIAC: "PONT", PORSCHE: "PORS", "RANGE ROVER": "RROV",
  RENAULT: "RENA", REO: "REO", "ROLLS ROYCE": "ROL", SAAB: "SAA",
  SATURN: "STRN", "SPECIAL CONSTRUCTION": "SPEC", STERLING: "STLG",
  STUDEBAKER: "STU", SUBARU: "SUBA", SUZUKI: "SUZI", TESLA: "TSLA",
  TOYOTA: "TOYT", TRIUMPH: "TRIU", VOLKSWAGEN: "VOLK", VOLVO: "VOLV",
  "WHITE / UTILITY": "WHIT", WINNEBAGO: "WINN", YAMAHA: "YAMA",
};

export const STYLE_CODES: Record<string, string> = {
  "BOAT ON TRAILER": "BOAT", BUS: "BU", COMMERCIAL: "CO", LIMOUSINE: "LM",
  "MOTOR CYCLE": "MC", "MOTOR HOME": "MH", "PASSENGER CAR": "PA",
  "PICK-UP TRUCK": "PU", TRAILER: "TR", TRUCK: "TK", VAN: "VN",
};

// Display name lists (derived from code maps — single source of truth).
export const COLORS = Object.keys(COLOR_CODES).sort();
export const MAKES = Object.keys(MAKE_CODES).sort();
export const STYLES = Object.keys(STYLE_CODES).sort();
