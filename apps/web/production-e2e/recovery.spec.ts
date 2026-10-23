import { test } from "@playwright/test";
import { verifyLostResponse } from "../e2e/helpers/recovery";

test("production browser: lost confirmation response hides stale approval and recovers one debit", async ({ page }) => {
  await verifyLostResponse(page);
});
