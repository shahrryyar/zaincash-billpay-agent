import { expect, test } from "@playwright/test";

test.use({ launchOptions: {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
} });

test("fake microphone exercises recording, WAV conversion and the editable draft without sending a turn", async ({ page }) => {
  await page.goto("/");
  let uploads = 0, turns = 0;
  page.on("request", r => { if (r.url().endsWith("/api/turn")) turns++; });
  await page.route("**/api/voice", async route => {
    uploads++;
    const data = route.request().postDataBuffer()!;
    expect(data.includes(Buffer.from("RIFF"))).toBe(true);
    expect(data.includes(Buffer.from('name="draft"\r\n\r\n1'))).toBe(true);
    await route.fulfill({ status: 200, json: { draft: { text: "دز خمسين ألف لأحمد" } } });
  });
  const mic = page.getByRole("button", { name: "اضغط وخليك ضاغط وتكلم" });
  await mic.focus(); await page.keyboard.down("Space");
  await expect(page.getByText(/دا أسمعك/)).toBeVisible();
  await expect(page.getByLabel("اكتب طلبك")).toBeDisabled();
  await page.waitForTimeout(1_200); // capture enough fake-device audio for the duration/silence gate
  await page.keyboard.up("Space");
  await expect(page.getByLabel("اكتب طلبك")).toHaveValue("دز خمسين ألف لأحمد");
  expect(uploads).toBe(1); expect(turns).toBe(0);
});

test("denied microphone permission returns to typing without a model call", async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); }; });
  await page.goto("/");
  const mic = page.getByRole("button", { name: "اضغط وخليك ضاغط وتكلم" });
  await mic.focus(); await page.keyboard.down("Space"); await page.keyboard.up("Space");
  await expect(page.getByText("ما عندي إذن أستعمل المايك. اكتب طلبك.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("اكتب طلبك")).toBeEnabled();
});

test("release before permission resolves stops the eventual track and uploads nothing", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
      (window as any).allowMic = () => {
        const context = new AudioContext();
        const stream = context.createMediaStreamDestination().stream;
        (window as any).lateTrack = stream.getTracks()[0];
        resolve(stream); void context.close();
      };
    });
  });
  await page.goto("/");
  let uploads = 0; page.on("request", r => { if (r.url().endsWith("/api/voice")) uploads++; });
  const mic = page.getByRole("button", { name: "اضغط وخليك ضاغط وتكلم" });
  await mic.focus(); await page.keyboard.down("Space");
  await expect(page.getByText("دا أفتح المايك…", { exact: true })).toBeVisible();
  await page.keyboard.up("Space");
  await page.evaluate(() => (window as any).allowMic());
  await expect(page.getByLabel("اكتب طلبك")).toBeEnabled();
  expect(await page.evaluate(() => (window as any).lateTrack.readyState)).toBe("ended");
  expect(uploads).toBe(0);
});
