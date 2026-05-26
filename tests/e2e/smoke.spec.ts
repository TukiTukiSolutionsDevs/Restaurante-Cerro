import { expect, test } from "@playwright/test";

test("homepage loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/restaurante cerro|next\.js/i);
});
