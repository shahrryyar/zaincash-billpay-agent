import { expect, test } from "@playwright/test";

test("production browser: lost confirmation response recovers one debit and keeps the receipt after a recheck", async ({ page }) => {
  await page.goto("/");
  const balance = page.getByText(/^[\d,]+ د\.ع$/).first();
  await expect(balance).toHaveText("200,000 د.ع");
  await page.getByLabel("اكتب طلبك").fill("دز 23000 لعلي كريم");
  await page.getByRole("button", { name: "دز", exact: true }).click();
  const card = page.getByRole("region", { name: "تأكيد التحويل" });
  await expect(card).toContainText("23,000 د.ع");
  let cut = false;
  await page.route("**/api/confirm", async (route) => {
    if (cut) { await route.continue(); return; }
    cut = true;
    const response = await route.fetch(); // real production execution completes; only this browser loses the reply
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await card.getByRole("button", { name: "أكّد ودز" }).click();
  await expect(page.getByText("ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك.")).toBeVisible();
  await page.getByRole("button", { name: "تحقق شصار بالعملية (ما راح ينرسل مرتين)", exact: true }).click();
  await expect(page.getByRole("region", { name: "الإيصال" })).toContainText("23,000 د.ع");
  await expect(balance).toHaveText("176,700 د.ع");
  const sid = await page.evaluate(() => sessionStorage.getItem("zc_session"));
  const response = await page.request.get(`/api/wallet?session_id=${sid}`);
  const d = await response.json();
  expect(d.wallet.transactions.filter((x: { amount_iqd: number }) => x.amount_iqd === 23000)).toHaveLength(1);
  await page.reload();
  await expect(balance).toHaveText("176,700 د.ع");
});
