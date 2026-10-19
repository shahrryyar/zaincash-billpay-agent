// Deterministic synthetic seed (docs/11). Fictional names, fictional 0770000xxxx numbers, fictional billers.
// No real customer data. Same seed for every eval run.
import { normaliseArabic } from "@zc/core";
import { clearAll, type Db } from "./db";

/** Fixed "now" of the seed world: 2026-10-15 12:00 UTC. History is relative to it. */
export const SEED_NOW = Date.UTC(2026, 9, 15, 12, 0, 0);
const DAY = 86_400_000;

export const DEMO_USER = "u_001";
export const LOW_USER = "u_low";

type C = [id: string, name: string, phone: string, relation?: string];

// Deliberate traps: duplicate first names, similar names, kunya, relations, spelling variants, a non-wallet contact.
const CONTACTS: C[] = [
  ["c_ahmed_ali", "أحمد علي", "07700004471"],
  ["c_ahmed_moh", "أحمد محمد", "07700009023"],
  ["c_ali_karim", "علي كريم", "07700000101"],
  ["c_ali_nasir", "علي ناصر", "07700000102"],
  ["c_moh_jasim", "محمد جاسم", "07700000111"],
  ["c_moh_salih", "محمد صالح", "07700000112"],
  ["c_moh_ridha", "محمد رضا", "07700000113"],
  ["c_abu_ali", "أبو علي", "07700000201"],
  ["c_hasan", "حسن", "07700000301"],
  ["c_husain", "حسين", "07700000302"],
  ["c_muhsin", "محسن", "07700000303"],
  ["c_zainab", "زينب", "07700000401"],
  ["c_zaina", "زينة", "07700000402"],
  ["c_mustafa", "مصطفى", "07700000501"],
  ["c_murtada", "مرتضى", "07700000502"],
  ["c_mama", "ماما", "07700000601", "ام"],
  ["c_baba", "بابا", "07700000602", "اب"],
  ["c_karrar", "أخوي كرار", "07700000701", "اخ"],
  ["c_zahraa", "أختي زهراء", "07700000702", "اخت"],
  ["c_khal", "خالي أبو جاسم", "07700000703", "خال"],
  ["c_wife", "مرتي", "07700000704", "زوجه"],
  ["c_abdullah", "عبدالله", "07700000801"],
  ["c_layla", "ليلى", "07700000901"],
  ["c_um_husain", "أم حسين", "07700001001"],
  // Kurdish (Sorani) names, as a Sulaymaniyah user saves them (2026-10-19): two Arases, similar ڕێباز / ڕێبوار. No relation
  // contacts here on purpose: «براکەم» must keep meaning the one stored brother.
  ["c_aras_omar", "ئاراس عومەر", "07700002001"],
  ["c_aras_karim", "ئاراس کەریم", "07700002002"],
  ["c_hemn", "هێمن", "07700002003"],
  ["c_shilan", "شیلان", "07700002004"],
  ["c_karwan", "کاروان", "07700002005"],
  ["c_rebaz", "ڕێباز", "07700002006"],
  ["c_rebwar", "ڕێبوار", "07700002007"],
  ["c_dlshad", "دڵشاد", "07700002008"],
];
export const NON_WALLET_CONTACT: C = ["c_nonwallet", "جاري أبو فيصل", "07700001201"];

const BILLERS = [
  ["b_electricity", "electricity", "الكهرباء (تجريبي)", "Electricity (demo)", ["الكهرباء", "الكهربا", "كهرباء الوطنية"], 0, "active"],
  ["b_generator", "generator", "اشتراك المولدة (تجريبي)", "Generator subscription (demo)", ["المولدة", "الأمبيرات", "المولد"], 0, "active"],
  ["b_internet", "internet", "شركة النور للإنترنت (تجريبي)", "Al-Noor Internet (demo)", ["الانترنت", "النت", "الواي فاي"], 0, "active"],
  ["b_water", "water", "الماء (تجريبي)", "Water (demo)", ["الماي", "الماء"], 0, "active"],
  ["b_mobile_topup", "mobile_topup", "شحن الرصيد (تجريبي)", "Mobile top-up (demo)", ["رصيد", "كارت", "شحن"], 0, "down"],
] as const;

/** [account id, owner, biller, ref, bill amount (null = open amount), bill status] */
const ACCOUNTS: [string, string, string, string, number | null, "unpaid" | "paid"][] = [
  ["ba_elec", DEMO_USER, "b_electricity", "EL-55100", 37_500, "unpaid"],
  ["ba_gen", DEMO_USER, "b_generator", "GN-20311", 60_000, "unpaid"],
  ["ba_net", DEMO_USER, "b_internet", "55123", 35_000, "unpaid"],
  ["ba_water", DEMO_USER, "b_water", "WT-7781", 12_000, "paid"],
  ["ba_topup", DEMO_USER, "b_mobile_topup", "07700000001", null, "unpaid"],
  ["ba_low_elec", LOW_USER, "b_electricity", "EL-90001", 37_500, "unpaid"],
  ["ba_low_gen", LOW_USER, "b_generator", "GN-90002", 60_000, "unpaid"],
];

export const SEED_BALANCE = { [DEMO_USER]: 200_000, [LOW_USER]: 15_000 } as const;

function insertUser(db: Db, id: string, name: string, phone: string, balance: number, daily: number) {
  db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(id, name, phone, balance, daily, SEED_NOW - 400 * DAY);
}

/** Deterministic history so «نفس المرة الفاتت» works. [days ago, contact id, amount] */
const HISTORY: [number, string, number][] = [
  [3, "c_ali_karim", 25_000], [9, "c_mama", 100_000], [16, "c_karrar", 20_000], [22, "c_ahmed_ali", 50_000],
  [31, "c_mama", 100_000], [38, "c_ali_karim", 25_000], [44, "c_husain", 15_000], [52, "c_zahraa", 30_000],
  [61, "c_mama", 100_000], [70, "c_ahmed_moh", 75_000], [78, "c_ali_nasir", 10_000],
];

export function applySeed(db: Db): void {
  clearAll(db);
  db.transaction(() => {
    insertUser(db, DEMO_USER, "المستخدم التجريبي", "07700000001", SEED_BALANCE[DEMO_USER], 1_500_000);
    insertUser(db, LOW_USER, "مستخدم برصيد قليل", "07700000002", SEED_BALANCE[LOW_USER], 1_500_000);
    const addContact = db.prepare("INSERT INTO contacts VALUES (?,?,?,?,?,?,?,?)");
    for (const [id, name, phone, relation] of CONTACTS) {
      const walletId = `u_${id.slice(2)}`;
      insertUser(db, walletId, name, phone, 50_000, 1_500_000);
      addContact.run(id, DEMO_USER, name, normaliseArabic(name), relation ?? null, phone, walletId, null);
    }
    const [ncId, ncName, ncPhone] = NON_WALLET_CONTACT;
    addContact.run(ncId, DEMO_USER, ncName, normaliseArabic(ncName), null, ncPhone, null, null);
    // the low-balance user has the same address book (ids get a `__low` suffix), so low-balance cases differ only in money
    for (const [id, name, phone, relation] of CONTACTS) {
      addContact.run(`${id}__low`, LOW_USER, name, normaliseArabic(name), relation ?? null, phone, `u_${id.slice(2)}`, null);
    }
    const addBiller = db.prepare("INSERT INTO billers VALUES (?,?,?,?,?,?,?)");
    const addSettle = db.prepare("INSERT INTO settlements VALUES (?,0)");
    db.prepare("INSERT INTO fee_pool VALUES ('p2p', 0)").run();
    for (const [id, code, ar, en, aliases, fee, status] of BILLERS) {
      addBiller.run(id, code, ar, en, JSON.stringify(aliases), fee, status);
      addSettle.run(id);
    }
    const addAccount = db.prepare("INSERT INTO bill_accounts VALUES (?,?,?,?,?)");
    const addBill = db.prepare("INSERT INTO bills VALUES (?,?,?,?,?)");
    for (const [id, owner, biller, ref, amount, status] of ACCOUNTS) {
      addAccount.run(id, owner, biller, ref, null);
      if (amount !== null) addBill.run(`bill_${id}`, id, amount, "2026-10-31", status);
    }
    const addTx = db.prepare("INSERT INTO transactions(id,owner_id,kind,counterparty,counterparty_id,amount_iqd,fee_iqd,status,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
    HISTORY.forEach(([days, contact, amount], i) => {
      const c = CONTACTS.find((x) => x[0] === contact) as C;
      addTx.run(`t_seed_${i}`, DEMO_USER, "transfer", c[1], contact, amount, 0, "completed", `seed-key-${i}`, SEED_NOW - days * DAY);
    });
  }).immediate();
}

/** Sum of all money in the system. Constant under any sequence of executes (conservation invariant). */
export function totalMoney(db: Db): number {
  const u = db.prepare("SELECT COALESCE(SUM(balance_iqd),0) s FROM users").get() as { s: number };
  const s = db.prepare("SELECT COALESCE(SUM(balance_iqd),0) s FROM settlements").get() as { s: number };
  const f = db.prepare("SELECT COALESCE(SUM(balance_iqd),0) s FROM fee_pool").get() as { s: number };
  return u.s + s.s + f.s;
}
