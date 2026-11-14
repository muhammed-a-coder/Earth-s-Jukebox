/** Turn written NASA copy into natural, speakable English for a neural voice. */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion", "trillion"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_PATTERN =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

function belowThousand(value: number): string {
  const parts: string[] = [];
  if (value >= 100) {
    parts.push(`${ONES[Math.floor(value / 100)]} hundred`);
    value %= 100;
  }
  if (value >= 20) {
    parts.push(TENS[Math.floor(value / 10)]);
    value %= 10;
  }
  if (value > 0) parts.push(ONES[value]);
  return parts.join(" ");
}

function integerToWords(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "zero";
  if (value < 0) return `minus ${integerToWords(Math.abs(value))}`;
  if (value > 999_999_999_999_999) return String(value);
  const groups: number[] = [];
  let remaining = Math.floor(value);
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (!groups[i]) continue;
    words.push(`${belowThousand(groups[i])}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return words.join(" ");
}

function decimalToWords(original: string): string {
  const [whole, fraction] = original.replace(/,/g, "").split(".");
  const wholeWords = integerToWords(Number(whole));
  if (!fraction) return wholeWords;
  const digits = fraction.split("").map((digit) => ONES[Number(digit)]).join(" ");
  return `${wholeWords} point ${digits}`;
}

function yearToWords(year: number): string {
  if (year === 2000) return "two thousand";
  if (year > 2000 && year < 2010) return `two thousand ${ONES[year - 2000]}`;
  if (year >= 2010 && year <= 2099) return `twenty ${belowThousand(year - 2000)}`;
  if (year === 1900) return "nineteen hundred";
  if (year > 1900 && year < 1910) return `nineteen oh ${ONES[year - 1900]}`;
  if (year >= 1910 && year <= 1999) return `nineteen ${belowThousand(year - 1900)}`;
  return integerToWords(year);
}

function numberToWords(raw: string): string {
  const cleaned = raw.replace(/,/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return raw;
  if (cleaned.includes(".")) return decimalToWords(cleaned);
  if (/^(?:1[89]\d{2}|20\d{2})$/.test(cleaned)) return yearToWords(value);
  return integerToWords(value);
}

const ORDINALS: Record<string, string> = {
  one: "first",
  two: "second",
  three: "third",
  four: "fourth",
  five: "fifth",
  six: "sixth",
  seven: "seventh",
  eight: "eighth",
  nine: "ninth",
  ten: "tenth",
  eleven: "eleventh",
  twelve: "twelfth",
  thirteen: "thirteenth",
  twenty: "twentieth",
  thirty: "thirtieth",
  forty: "fortieth",
  fifty: "fiftieth",
  sixty: "sixtieth",
  seventy: "seventieth",
  eighty: "eightieth",
  ninety: "ninetieth",
  hundred: "hundredth",
  thousand: "thousandth",
  million: "millionth",
  billion: "billionth",
};

function ordinalToWords(raw: string): string {
  const words = integerToWords(Number(raw)).split(" ");
  const last = words.pop() ?? "zeroth";
  words.push(ORDINALS[last] ?? `${last}th`);
  return words.join(" ");
}

function monthIndex(name: string): number {
  const key = name.slice(0, 3).toLowerCase();
  return MONTHS.findIndex((month) => month.slice(0, 3).toLowerCase() === key);
}

function validDate(month: number, day: number, year: number): boolean {
  if (month < 0 || month > 11 || day < 1 || day > 31) return false;
  if (year < 1000 || year > 2100) return false;
  return day <= new Date(year, month + 1, 0).getDate();
}

function formatDate(month: number, day: number, year: number): string {
  return `${MONTHS[month]} ${day}, ${year}`;
}

function expandUnits(text: string): string {
  return text
    .replace(/\bkm\/s\b/gi, "kilometers per second")
    .replace(/\bm\/s\b/gi, "meters per second")
    .replace(/\bkm\/h\b/gi, "kilometers per hour")
    .replace(/\bmph\b/gi, "miles per hour")
    .replace(/\bkms\b/gi, "kilometers")
    .replace(/\bkm2\b/gi, "square kilometers")
    .replace(/\bkm²\b/gi, "square kilometers")
    .replace(/\bkm\b/gi, "kilometers")
    .replace(/\bkg\b/gi, "kilograms")
    .replace(/\bcm\b/gi, "centimeters")
    .replace(/\bmm\b/gi, "millimeters")
    .replace(/\bmi\b/gi, "miles")
    .replace(/\bft\b/gi, "feet")
    .replace(/\bAU\b/g, "astronomical units")
    .replace(/\bly\b/g, "light years")
    .replace(/\bhrs?\b/gi, "hours")
    .replace(/\bmins?\b/gi, "minutes")
    .replace(/\bsecs?\b/gi, "seconds")
    .replace(/°C\b/g, " degrees Celsius")
    .replace(/°F\b/g, " degrees Fahrenheit")
    .replace(/°/g, " degrees ")
    .replace(/%/g, " percent");
}

function expandAbbreviations(text: string): string {
  return text
    .replace(/\bJWST\b/g, "James Webb Space Telescope")
    .replace(/\bHST\b/g, "Hubble Space Telescope")
    .replace(/\bISS\b/g, "International Space Station")
    .replace(/\bJPL\b/g, "J P L")
    .replace(/\bSDO\b/g, "S D O")
    .replace(/\bSVS\b/g, "S V S")
    .replace(/\bGIBS\b/g, "GIBBS")
    .replace(/\bUSGS\b/g, "U S G S")
    .replace(/\bNOAA\b/g, "NOAA")
    .replace(/\bLEO\b/g, "low Earth orbit")
    .replace(/\bBCE\b/g, "B C E")
    .replace(/\bCE\b/g, "C E")
    .replace(/\bBC\b/g, "B C")
    .replace(/\bAD\b/g, "A D")
    .replace(/\be\.g\./gi, "for example")
    .replace(/\bi\.e\./gi, "that is")
    .replace(/\bvs\.?/gi, "versus")
    .replace(/\bapprox\./gi, "approximately")
    .replace(/\bDr\./g, "Doctor")
    .replace(/\bMr\./g, "Mister")
    .replace(/\bMrs\./g, "Missus")
    .replace(/\bMt\./g, "Mount")
    .replace(/\bSt\./g, "Saint")
    .replace(/\bJr\./g, "Junior")
    .replace(/\bNo\.\s*(\d)/g, "number $1")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/=/g, " equals ")
    .replace(/×/g, " times ")
    .replace(/→/g, " to ")
    .replace(/[—–]/g, ", ");
}

function expandDates(text: string): string {
  let result = text;
  result = result.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, year, month, day) => {
    const monthIndexValue = Number(month) - 1;
    const dayValue = Number(day);
    const yearValue = Number(year);
    return validDate(monthIndexValue, dayValue, yearValue)
      ? formatDate(monthIndexValue, dayValue, yearValue)
      : match;
  });
  result = result.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g, (match, month, day, year) => {
    const monthIndexValue = Number(month) - 1;
    const dayValue = Number(day);
    const yearValue = year.length === 2 ? 2000 + Number(year) : Number(year);
    return validDate(monthIndexValue, dayValue, yearValue)
      ? formatDate(monthIndexValue, dayValue, yearValue)
      : match;
  });
  result = result.replace(
    new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"),
    (match, month, day, year) => {
      const index = monthIndex(month);
      const dayValue = Number(day);
      if (index < 0 || dayValue < 1 || dayValue > 31) return match;
      return year ? `${MONTHS[index]} ${dayValue}, ${year}` : `${MONTHS[index]} ${dayValue}`;
    },
  );
  result = result.replace(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})\\.?,?\\s+(\\d{4})\\b`, "gi"),
    (match, day, month, year) => {
      const index = monthIndex(month);
      const dayValue = Number(day);
      return index >= 0 && dayValue >= 1 && dayValue <= 31 ? `${MONTHS[index]} ${dayValue}, ${year}` : match;
    },
  );
  result = result.replace(/\b(1[89]\d0|20[0-2]0)s\b/g, (_, decade) => {
    const value = Number(decade);
    if (value === 2000) return "two thousands";
    const base = yearToWords(value);
    return `${base.replace(/y$/, "ie")}s`;
  });
  return result;
}

/**
 * The public normaliser. It is deliberately conservative: it keeps acronyms
 * the voice already pronounces well, and only rewrites what would otherwise be
 * read as symbols or digit strings.
 */
export function normalizeForSpeech(input: string): string {
  if (!input) return "";
  let text = input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "the linked NASA page")
    .replace(/www\.\S+/gi, "the linked NASA page")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\r/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .replace(/[*_#>|]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/"/g, " ")
    .replace(/!!+/g, "!")
    .replace(/\?\?+/g, "?")
    .replace(/\.{3,}|…/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  text = expandAbbreviations(text);
  text = expandUnits(text);
  text = expandDates(text);
  text = text.replace(/\b(\d+)(st|nd|rd|th)\b/gi, (_, value) => ordinalToWords(value));
  text = text.replace(/-?\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|-?\b\d+(?:\.\d+)?\b/g, (match) => numberToWords(match));
  text = text
    .replace(/\(/g, ", ")
    .replace(/\)/g, ". ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/([.,!?;:])(?=\S)/g, "$1 ")
    .trim();
  return text;
}
