import { expect, test, type Page } from "@playwright/test";

// Every test runs in a fresh browser context, so it gets its own session id and its own sandboxed wallet.
const balance = (page: Page) => page.getByText(/^[\d,]+ د\.ع$/).first();
async function say(page: Page, text: string) {
  await page.getByLabel("اكتب طلبك").fill(text);
  await page.getByRole("button", { name: "دز", exact: true }).click();
}
const openPanel = (page: Page) => page.getByRole("button", { name: "لوحة العرض" }).click();

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(balance(page)).toHaveText("200,000 د.ع");
});

test("hero: two Ahmeds is a question, the pick gives a card, confirm sends once", async ({ page }) => {
  await say(page, "دز خمسين ألف لأحمد");
  await expect(page.getByText("عندك 2 باسم أحمد، ياهو تقصد؟")).toBeVisible();
  await expect(balance(page)).toHaveText("200,000 د.ع");
  await page.getByRole("button", { name: /أحمد علي/ }).click();
  const card = page.getByRole("region", { name: "تأكيد التحويل" });
  await expect(card).toContainText("50,000 د.ع");
  await expect(card).toContainText("ما انرسل شي بعد");
  await card.getByRole("button", { name: "أكّد ودز" }).click();
  await expect(page.getByRole("region", { name: "الإيصال" })).toContainText(/ZC-\d{8}/);
  await expect(balance(page)).toHaveText("149,700 د.ع");
});

test("cancel on the card: nothing is sent", async ({ page }) => {
  await say(page, "ادفع المولدة");
  const card = page.getByRole("region", { name: "تأكيد دفع الفاتورة" });
  await expect(card).toContainText("60,000 د.ع");
  await card.getByRole("button", { name: "إلغاء" }).click();
  await expect(page.getByText("تمام، لغيتها. ما صار شي.")).toBeVisible();
  await expect(balance(page)).toHaveText("200,000 د.ع");
});

test("the connection drops after the wallet debited: «جاي نتأكد», then ONE debit", async ({ page }) => {
  await openPanel(page);
  await page.getByRole("button", { name: "انقطاع بعد التنفيذ" }).click();
  await expect(page.getByText("عطل مفعّل: timeout")).toBeVisible();
  await say(page, "دز خمسين ألف لعلي كريم");
  await page.getByRole("button", { name: "أكّد ودز" }).click();
  await expect(page.getByRole("region", { name: "الإيصال" })).toBeVisible({ timeout: 30_000 });
  await expect(balance(page)).toHaveText("149,700 د.ع");
});

test("biller down: an honest error, no card, nothing charged", async ({ page }) => {
  await openPanel(page);
  await page.getByRole("button", { name: "المولدة واگفة" }).click();
  await say(page, "ادفع المولدة");
  await expect(page.getByText(/واگفة هسه. ما انخصم منك شي/)).toBeVisible();
  await expect(page.getByRole("region", { name: "تأكيد دفع الفاتورة" })).toHaveCount(0);
  await expect(balance(page)).toHaveText("200,000 د.ع");
});

test("an unconfirmed card expires when the time runs out", async ({ page }) => {
  await say(page, "ادفع الكهرباء");
  await expect(page.getByRole("region", { name: "تأكيد دفع الفاتورة" })).toBeVisible();
  await openPanel(page);
  await page.getByRole("button", { name: "قدّم الوقت ساعة" }).click(); // the server clock passes the 120 s window
  await expect(page.getByText("انتهى وقت التأكيد، نعيد الطلب؟")).toBeVisible();
  await expect(balance(page)).toHaveText("200,000 د.ع");
});

test("schedule: approved now, paid at the time, by the wallet's own runner", async ({ page }) => {
  await say(page, "ادفع المولدة باچر الساعة 9 الصبح");
  const card = page.getByRole("region", { name: "تأكيد جدولة دفع الفاتورة" });
  await expect(card).toContainText("ما راح ينرسل شي هسه");
  await card.getByRole("button", { name: "أكّد وجدول" }).click();
  await expect(page.getByRole("region", { name: "الإيصال" })).toContainText("انجدولت");
  await expect(balance(page)).toHaveText("200,000 د.ع");
  await openPanel(page);
  await page.getByRole("button", { name: "قدّم الوقت يوم" }).click();
  if ((await balance(page).textContent()) === "200,000 د.ع") await page.getByRole("button", { name: "قدّم الوقت ساعة" }).click();
  await expect(balance(page)).toHaveText("140,000 د.ع");
  await expect(page.getByText(/اندفعت الفاتورة المجدولة/)).toBeVisible();
});

test("voice read-back: nothing happens until «صح»", async ({ page }) => {
  await openPanel(page);
  await page.getByLabel("نص المحاكاة").fill("دز خمسين ألف لأحمد");
  await page.getByRole("button", { name: "🎤 أرسل كصوت" }).click();
  const readback = page.getByRole("region", { name: "تأكيد اللي سمعته" });
  await expect(readback).toContainText("دز خمسين ألف لأحمد");
  await expect(page.getByText("عندك 2 باسم أحمد")).toHaveCount(0);
  await readback.getByRole("button", { name: "صح، كمّل" }).click();
  await expect(page.getByText("عندك 2 باسم أحمد، ياهو تقصد؟")).toBeVisible();
});

test("two judges at once: one payment never shows in the other's wallet", async ({ browser }) => {
  const a = await (await browser.newContext({ locale: "ar-IQ" })).newPage();
  const b = await (await browser.newContext({ locale: "ar-IQ" })).newPage();
  await a.goto("/"); await b.goto("/");
  await say(a, "دز خمسين ألف لعلي كريم");
  await a.getByRole("button", { name: "أكّد ودز" }).click();
  await expect(balance(a)).toHaveText("149,700 د.ع");
  await b.reload();
  await expect(balance(b)).toHaveText("200,000 د.ع");
});

test("Kurdish: the picker switches the whole screen; two Arases is a question; the Kurdish card confirms once", async ({ page }) => {
  await page.getByRole("button", { name: "کوردی" }).click();
  await expect(page.getByRole("button", { name: "کوردی" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "ckb");
  await expect(page.getByText("داواکارییەکەت بە یەک ڕستە بنووسە")).toBeVisible();
  await expect(page.getByText(/^[\d,]+ دینار$/).first()).toHaveText("200,000 دینار");
  await page.getByLabel("داواکارییەکەت بنووسە").fill("پەنجا هەزار بنێرە بۆ ئاراس");
  await page.getByRole("button", { name: "بینێرە", exact: true }).click();
  await expect(page.getByText("2 کەست هەیە بە ناوی ئاراس، مەبەستت کامیانە؟")).toBeVisible();
  await page.getByRole("button", { name: /ئاراس کەریم/ }).click();
  const card = page.getByRole("region", { name: "پشتڕاستکردنەوەی ناردن" });
  await expect(card).toContainText("50,000 دینار");
  await expect(card).toContainText("پەنجا هەزار");
  await expect(card).toContainText("هێشتا هیچ نەنێردراوە");
  await card.getByRole("button", { name: "پشتڕاستی بکەوە و بینێرە" }).click();
  await expect(page.getByRole("region", { name: "پسوولەی وەرگرتن" })).toContainText(/ZC-\d{8}/);
  await expect(page.getByText(/^[\d,]+ دینار$/).first()).toHaveText("149,700 دینار");
  // back to Arabic: the next reply is Arabic again
  await page.getByRole("button", { name: "عربي" }).click();
  await say(page, "شكد رصيدي");
  await expect(page.getByText("رصيدك 149,700 د.ع.")).toBeVisible();
});
