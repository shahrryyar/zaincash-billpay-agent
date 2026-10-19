// Builds the native-speaker review sheet: every Arabic string a user sees (packages/core/src/copy.ts) plus the dialect
// word lists the deterministic parsers rely on. A reviewer marks each row; nothing here changes the code.
//   pnpm --filter @zc/eval dialect-sheet   -> eval/data/review/dialect.review.csv (opens in Excel / Google Sheets)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COPY } from "@zc/core";

// Word lists used by the parsers (kept here by hand, with the file they live in). <!-- VERIFY-DIALECT -->
const LEXICON: [string, string, string][] = [
  ["amount.ts", "احدعش، اثنعش، ثلاثطعش/تلطعش، اربعطعش، خمسطعش/خمستعش، ستطعش، سبعطعش، ثمنطعش، تسعطعش", "11 to 19"],
  ["amount.ts", "ميت ألف، ربع مليون، نص مليون، تلثمية، الفين، مليونين", "100,000 / 250,000 / 500,000 / 300 / 2,000 / 2,000,000"],
  ["amount.ts", "ورقة، دفتر", "street names for $100 and $10,000 (refused: dollars are not supported)"],
  ["resolver.ts", "أمي، ماما، والدتي / أبوي، بابا / أخوي، خوي / أختي / خالي / عمي / مرتي، زوجتي / ابني / بنتي", "relation words → the contact saved with that relation"],
  ["resolver.ts", "جيراننا، جارنا، صاحبي، صديقي، رفيقي، حبيبي، الغالي، عيني، ثواب، حجي، ابن عمتي، بنت خالي", "words after a name that only describe the person (ignored for matching)"],
  ["resolver.ts", "حسوني → حسن / حسين، زنوبة → زينب", "nicknames: only PROPOSE these people, the user picks"],
  ["schema.ts", "نفس المبلغ، مثل المرة الفاتت، اخر مرة، ذيج المرة، المرة الماضية، مثل ما دزيت", "\"same amount as last time\" (the amount comes from the wallet's history)"],
  ["when.ts", "باچر، بعد باچر، اليوم، الليلة، بعد ساعة، بعد نص ساعة، يوم 25، اخر الشهر، اول الشهر، الجمعة", "dates and delays for scheduled payments"],
  ["when.ts", "الصبح، الظهر، العصر، المغرب، المساء، بالليل، 9 ونص، 9 الا ربع", "times of day (\"بعد الظهر\" is known to be read as 12:00: wrong, to fix)"],
  ["clarify.ts", "اي، إي، ايه، ايوه، اكيد، تمام، صح / لا، كلا / الغي، بطلت، ماريد، وگف", "yes / no / cancel in a clarification (a spoken yes NEVER confirms a payment)"],
];

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../data/review/dialect.review.csv");
const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
const rows: string[][] = [["where", "key / list", "Arabic (as the user sees or says it)", "meaning (English)", "natural Iraqi? (Y/N)", "better wording", "notes"]];
for (const [key, v] of Object.entries(COPY)) rows.push(["copy.ts", key, v.ar, v.en, "", "", ""]);
for (const [file, words, meaning] of LEXICON) rows.push([file, "word list", words, meaning, "", "", ""]);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n") + "\n"); // BOM: Excel shows Arabic correctly
console.log(`${rows.length - 1} rows -> ${out}`);
