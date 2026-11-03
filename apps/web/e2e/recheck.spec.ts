import { expect, test } from "@playwright/test";

// The Confirm request never reaches the server. «Check what happened» must not pay: it brings the same card back.
test("a Confirm that never arrived: checking shows the live card again and pays nothing", async ({ page }) => {
  await page.goto("/");
  const balance = page.getByText(/^[\d,]+ د\.ع$/).first();
  const input = page.getByLabel("اكتب طلبك");
  await expect(balance).toHaveText("200,000 د.ع");
  await input.fill("دز خمسين ألف لعلي كريم");
  await page.getByRole("button", { name: "دز", exact: true }).click();
  const card = page.getByRole("region", { name: "تأكيد التحويل" });
  await expect(card).toContainText("50,000 د.ع");
  let confirms = 0, dropped = false;
  await page.route("**/api/confirm", async (route) => {
    confirms++;
    if (!dropped) { dropped = true; await route.abort("failed"); return; } // never forwarded to the server
    await route.continue();
  });
  await card.getByRole("button", { name: "أكّد ودز" }).click();
  await expect(page.getByText("ما متأكدين إذا انرسلت. لا تعيد الإرسال، راح نتأكد ونبلغك.")).toBeVisible();
  await expect(card).toHaveCount(0);
  const recheck = page.waitForRequest("**/api/recheck");
  await page.getByRole("button", { name: "تحقق شصار بالعملية (ما راح ينرسل مرتين)", exact: true }).click();
  expect((await recheck).postDataJSON()).toMatchObject({ card_id: expect.any(String) });
  await expect(card).toContainText("50,000 د.ع"); // the same, still-live card
  await expect(page.getByText("راجع التفاصيل وكبس أكّد. ما انرسل شي بعد.").last()).toBeVisible();
  expect(confirms).toBe(1); // checking sent no Confirm
  await expect(balance).toHaveText("200,000 د.ع");
  await card.getByRole("button", { name: "أكّد ودز" }).click(); // the user's own second tap is the only thing that pays
  await expect(page.getByRole("region", { name: "الإيصال" })).toContainText("50,000 د.ع");
  await expect(balance).toHaveText("149,700 د.ع");
});

test("confirmation card: focus moves to its heading; the ticking timer is hidden from the live log", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("اكتب طلبك").fill("دز خمسين ألف لعلي كريم");
  await page.getByRole("button", { name: "دز", exact: true }).click();
  const card = page.getByRole("region", { name: "تأكيد التحويل" });
  await expect(card.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(card.getByTestId("card-timer")).toHaveAttribute("aria-hidden", "true");
  await expect(card.getByTestId("card-timer-announce")).toHaveText(""); // 2:00 left: nothing announced until 0:30
});

test("a refused request (busy, session gone) gets an honest message, not «offline» or «maybe sent»", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/^[\d,]+ د\.ع$/).first()).toHaveText("200,000 د.ع");
  await page.route("**/api/turn", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "busy", message: "" }) }));
  await page.getByLabel("اكتب طلبك").fill("شكد رصيدي");
  await page.getByRole("button", { name: "دز", exact: true }).click();
  await expect(page.getByText("الخدمة مشغولة هسه. ما انرسل شي، جرّب بعد شوية.")).toBeVisible();
  await expect(page.getByLabel("اكتب طلبك")).toBeEnabled();
  await page.route("**/api/wallet*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "session_lost", message: "" }) }));
  await expect(page.getByRole("alert").filter({ hasText: "حدّث الصفحة" })).toBeVisible({ timeout: 10_000 });
});
