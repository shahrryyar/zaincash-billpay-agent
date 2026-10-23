import { expect, type Page } from "@playwright/test";

/** The server commits; this browser alone loses the response. All wallets are synthetic. */
export async function verifyLostResponse(page: Page) {
  await page.goto("/");
  const balance = page.getByText(/^[\d,]+ د\.ع$/).first();
  const input = page.getByLabel("اكتب طلبك");
  await expect(balance).toHaveText("200,000 د.ع");
  await input.fill("دز خمسين ألف لعلي كريم");
  await page.getByRole("button", { name: "دز", exact: true }).click();
  const card = page.getByRole("region", { name: "تأكيد التحويل" });
  await expect(card).toContainText("50,000 د.ع");
  let cut = false;
  await page.route("**/api/confirm", async (route) => {
    if (cut) { await route.continue(); return; }
    cut = true;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await card.getByRole("button", { name: "أكّد ودز" }).click();
  await expect(page.getByText("ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك.")).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(input).toBeDisabled();
  await page.getByRole("button", { name: "تحقق شصار بالعملية (ما راح ينرسل مرتين)", exact: true }).click();
  const receipt = page.getByRole("region", { name: "الإيصال" });
  await expect(receipt).toContainText("50,000 د.ع");
  await expect(receipt).toContainText("علي كريم");
  await expect(balance).toHaveText("149,700 د.ع");
  await expect(input).toBeEnabled();
  const reference = (await receipt.innerText()).match(/ZC-\d{8}/)?.[0];
  expect(reference).toBeTruthy();
  const sid = await page.evaluate(() => sessionStorage.getItem("zc_session"));
  const d = await (await page.request.get(`/api/wallet?session_id=${sid}`)).json();
  expect(d.wallet.transactions.filter((x: { reference: string }) => x.reference === reference)).toHaveLength(1);
  await page.reload(); await expect(balance).toHaveText("149,700 د.ع");
}
