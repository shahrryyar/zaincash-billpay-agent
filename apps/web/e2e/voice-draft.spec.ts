import { expect, test, type Page } from "@playwright/test";

async function simulatedDraft(page: Page, text = "دز خمسين ألف لأحمد") {
  await page.getByRole("button", { name: "لوحة العرض" }).click();
  await page.getByLabel("نص المحاكاة").fill(text);
  await page.getByRole("button", { name: "🎤 أرسل كصوت" }).click();
  await page.getByRole("button", { name: "لوحة العرض" }).click();
  await expect(page.getByLabel("اكتب طلبك")).toHaveValue(text);
}
test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("voice editing keeps raw text, sends only the edited name/amount, and needs a payment tap", async ({ page }) => {
  const turns: string[] = [];
  page.on("request", r => { if (r.url().endsWith("/api/turn")) turns.push(r.postData() ?? ""); });
  await simulatedDraft(page, "دز ميت ألف لأحمد");
  expect(turns).toHaveLength(0);
  const input = page.getByLabel("اكتب طلبك");
  await input.fill("دز خمسين ألف لعلي كريم");
  await page.getByText("النص الأصلي اللي سمعه المايك", { exact: true }).click();
  await expect(page.getByRole("region", { name: "تأكيد اللي سمعته" })).toContainText("دز ميت ألف لأحمد");
  await expect(page.getByRole("region", { name: "تأكيد التحويل" })).toHaveCount(0);
  await page.getByRole("button", { name: "أرسل الطلب", exact: true }).click();
  const card = page.getByRole("region", { name: "تأكيد التحويل" });
  await expect(card).toContainText("50,000 د.ع"); await expect(card).toContainText("علي كريم");
  expect(turns).toHaveLength(1); expect(JSON.parse(turns[0]!).text).toBe("دز خمسين ألف لعلي كريم");
  await expect(page.getByText("200,000 د.ع", { exact: true }).first()).toBeVisible();
  await card.getByRole("button", { name: "أكّد ودز" }).click();
  await expect(page.getByRole("region", { name: "الإيصال" })).toContainText("50,000 د.ع");
  await expect(page.getByText("149,700 د.ع", { exact: true }).first()).toBeVisible();
});

test("discard drops the voice draft; an existing typed message cannot be overwritten", async ({ page }) => {
  let turns = 0; page.on("request", r => { if (r.url().endsWith("/api/turn")) turns++; });
  await simulatedDraft(page);
  await page.getByRole("button", { name: "إلغاء التسجيل", exact: true }).click();
  await expect(page.getByLabel("اكتب طلبك")).toHaveValue("");
  await expect(page.getByRole("button", { name: "أرسل الطلب", exact: true })).toHaveCount(0);
  await page.getByLabel("اكتب طلبك").fill("شكد رصيدي");
  await page.getByRole("button", { name: "لوحة العرض" }).click();
  await expect(page.getByRole("button", { name: "🎤 أرسل كصوت" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "اضغط وخليك ضاغط وتكلم" })).toHaveCount(0);
  expect(turns).toBe(0);
});

test("late ASR completion after cancellation cannot resurrect or submit the recording", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  let reached!: () => void;
  const arrived = new Promise<void>(r => { reached = r; });
  await page.route("**/api/voice", async route => {
    const response = await route.fetch(); reached(); await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole("button", { name: "لوحة العرض" }).click();
  await page.getByLabel("نص المحاكاة").fill("دز خمسين ألف لأحمد");
  await page.getByRole("button", { name: "🎤 أرسل كصوت" }).click();
  await arrived;
  await page.getByRole("button", { name: "إلغاء التسجيل", exact: true }).click(); release();
  await expect(page.getByLabel("اكتب طلبك")).toBeEnabled();
  await page.getByLabel("اكتب طلبك").fill("شكد رصيدي");
  await expect(page.getByLabel("اكتب طلبك")).toHaveValue("شكد رصيدي");
  await expect(page.getByRole("region", { name: "تأكيد اللي سمعته" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "تأكيد التحويل" })).toHaveCount(0);
});

test("provider failure and low confidence leave typing available and send nothing", async ({ page }) => {
  await page.getByRole("button", { name: "لوحة العرض" }).click();
  await page.getByLabel("الثقة", { exact: true }).selectOption("0.3");
  await page.getByRole("button", { name: "🎤 أرسل كصوت" }).click();
  await expect(page.getByText("ما سمعتك زين، تعيدها؟", { exact: true })).toBeVisible();
  await expect(page.getByLabel("اكتب طلبك")).toBeEnabled();
  await page.route("**/api/voice", route => route.fulfill({ status: 502, json: { message: "الصوت ما يشتغل هسه. اكتب طلبك، وما انرسل شي." } }));
  await page.getByRole("button", { name: "🎤 أرسل كصوت" }).click();
  await expect(page.getByText("الصوت ما يشتغل هسه. اكتب طلبك، وما انرسل شي.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("اكتب طلبك")).toHaveValue("");
  await expect(page.getByLabel("اكتب طلبك")).toBeEnabled();
  await expect(page.getByRole("region", { name: "تأكيد التحويل" })).toHaveCount(0);
});

test("Sorani voice draft is editable and does not call the model until sent", async ({ page }) => {
  await page.getByRole("button", { name: "کوردی" }).click();
  await page.getByRole("button", { name: "پانێڵی نمایش" }).click();
  await page.getByLabel("دەقی لاسایی").fill("پەنجا هەزار بنێرە بۆ ئاراس");
  await page.getByRole("button", { name: "🎤 وەک دەنگ بینێرە" }).click();
  await page.getByRole("button", { name: "پانێڵی نمایش" }).click();
  await expect(page.getByLabel("داواکارییەکەت بنووسە")).toHaveValue("پەنجا هەزار بنێرە بۆ ئاراس");
  await expect(page.getByText("2 کەست هەیە بە ناوی ئاراس، مەبەستت کامیانە؟")).toHaveCount(0);
  await page.getByRole("button", { name: "داواکارییەکە بنێرە", exact: true }).click();
  await expect(page.getByText("2 کەست هەیە بە ناوی ئاراس، مەبەستت کامیانە؟")).toBeVisible();
});

test("voice review at phone size and 200% zoom keeps editing and discard reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simulatedDraft(page);
  await page.evaluate(() => { document.documentElement.style.zoom = "200%"; });
  const input = page.getByLabel("اكتب طلبك");
  await input.fill("دز خمسين ألف لعلي كريم");
  await input.scrollIntoViewIfNeeded();
  const bounds = await input.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
  await page.getByRole("button", { name: "إلغاء التسجيل", exact: true }).click();
  await expect(input).toHaveValue("");
});
