import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Opt in with an ignored synthetic audio file. Chrome's fake device still exercises real capture, upload and ASR.
const fixture = process.env.PRODUCTION_VOICE_WAV ? resolve(process.env.PRODUCTION_VOICE_WAV) : "";
if (fixture && !existsSync(fixture)) throw new Error("PRODUCTION_VOICE_WAV must exist");
test.use({ launchOptions: {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", ...(fixture ? [`--use-file-for-fake-audio-capture=${fixture}`] : [])],
} });

test("production voice: real ASR draft, explicit edited request, Gemini card and one confirmed receipt", async ({ page }, info) => {
  test.skip(!fixture, "Set PRODUCTION_VOICE_WAV to synthetic speech; never substitute a fake provider in production");
  await page.goto("/");
  const balance = page.getByText(/^[\d,]+ د\.ع$/).first();
  await expect(balance).toHaveText("200,000 د.ع");
  let turns = 0, confirms = 0;
  page.on("request", r => { if (r.url().endsWith("/api/turn")) turns++; if (r.url().endsWith("/api/confirm")) confirms++; });
  const mic = page.getByRole("button", { name: "اضغط وخليك ضاغط وتكلم" });
  await mic.focus(); await page.keyboard.down("Space");
  await expect(page.getByText(/دا أسمعك/)).toBeVisible();
  await page.waitForTimeout(3_500); // fixture speech plus trailing silence
  const voiceReply = page.waitForResponse(r => r.url().endsWith("/api/voice") && r.request().method() === "POST");
  await page.keyboard.up("Space");
  const response = await voiceReply;
  expect(response.status()).toBe(200);
  const voice = await response.json();
  await info.attach("actual-voice-response", { body: JSON.stringify(voice, null, 2), contentType: "application/json" });
  expect(voice.transcript.provider).toContain("regalabs");
  expect(voice.draft.text.trim()).not.toBe(""); expect(voice.reply).toBeUndefined();
  const input = page.getByLabel("اكتب طلبك");
  await expect(input).toHaveValue(voice.draft.text);
  expect(turns).toBe(0); expect(confirms).toBe(0);
  await expect(balance).toHaveText("200,000 د.ع");
  await input.fill("دز 23000 لعلي كريم");
  await page.getByText("النص الأصلي اللي سمعه المايك", { exact: true }).click();
  await expect(page.getByRole("region", { name: "تأكيد اللي سمعته" })).toContainText(voice.draft.text);
  const modelReply = page.waitForResponse(r => r.url().endsWith("/api/turn") && r.request().method() === "POST");
  await page.getByRole("button", { name: "أرسل الطلب", exact: true }).click();
  const understood = await (await modelReply).json();
  expect(understood.reply.trace.model).toBe("gemini:gemini-3.5-flash-lite");
  expect(understood.reply.trace.llm_error).toBeUndefined();
  await info.attach("actual-model-trace", { body: JSON.stringify(understood.reply.trace, null, 2), contentType: "application/json" });
  const card = page.getByRole("region", { name: "تأكيد التحويل" });
  await expect(card).toContainText("23,000 د.ع"); await expect(card).toContainText("علي كريم");
  await expect(balance).toHaveText("200,000 د.ع");
  expect(turns).toBe(1); expect(confirms).toBe(0);
  await card.getByRole("button", { name: "أكّد ودز" }).click();
  const receipt = page.getByRole("region", { name: "الإيصال" });
  await expect(receipt).toContainText("23,000 د.ع"); await expect(balance).toHaveText("176,700 د.ع");
  await page.screenshot({ path: info.outputPath("voice-confirmed.png"), fullPage: true });
  const reference = (await receipt.innerText()).match(/ZC-\d{8}/)?.[0]; expect(reference).toBeTruthy();
  const sid = await page.evaluate(() => sessionStorage.getItem("zc_session"));
  const state = await (await page.request.get(`/api/wallet?session_id=${sid}`)).json();
  expect(state.wallet.transactions.filter((x: { reference: string }) => x.reference === reference)).toHaveLength(1);
});
