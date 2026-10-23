import { test } from "@playwright/test";
import { verifyLostResponse } from "./helpers/recovery";

test("lost confirmation response hides stale card, blocks a fresh send, and recovers one debit", async ({ page }) => {
  await verifyLostResponse(page);
});
