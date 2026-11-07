import { expect, test } from "@playwright/test"
import { fixture } from "./fixtures"
import { login } from "./helpers"

test.describe("admin portal", () => {
  test("lists applications and can open partner management pages", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/app/applications")
    await expect(page.getByRole("heading", { name: "Заявки креаторов" })).toBeVisible()
    if (test.info().project.name === "desktop") await expect(page.getByText(fixture.applicationRejectEmail)).toBeVisible()
    await page.goto("/app/partners")
    await expect(page.getByRole("heading", { name: "Партнёры" })).toBeVisible()
    await page.locator("tr").filter({ hasText: fixture.creatorName }).getByRole("link", { name: "Открыть" }).click()
    await expect(page).toHaveURL(/\/app\/partners\//)
    await expect(page.getByRole("heading", { name: fixture.creatorName })).toBeVisible()
    await expect(page.getByText("История заявок")).toBeVisible()
    await expect(page.getByText("Административная активность")).toBeVisible()
  })

  test("can approve and reject dedicated applications", async ({ page }) => {
    test.skip(test.info().project.name === "mobile", "Mutating admin scenario runs once on desktop")
    await login(page, "admin")
    await page.goto("/app/applications")
    await page.getByRole("button", { name: /Открыть E2E Reject Applicant/ }).click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByLabel(/Причина отказа/).fill("E2E rejection reason")
    await page.getByRole("button", { name: "Отклонить" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
    await page.getByRole("tab", { name: /Одобрена/ }).click()
    await expect(page.getByText("Заявок со статусом «одобрена» нет.")).toHaveCount(0)
    await page.getByRole("tab", { name: /На рассмотрении/ }).click()
    await page.getByRole("button", { name: /Открыть E2E Approve Applicant/ }).click()
    await page.getByRole("button", { name: "Одобрить" }).click()
    await expect(page.getByRole("dialog")).toBeHidden()
  })

  test("keeps disabled financial admin controls unavailable", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/app/payouts")
    await expect(page.getByText(/временно отключены|временно недоступ|недоступны/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /Одобрить|Отклонить|Отметить выплаченной/ })).toHaveCount(0)
  })

  test("renders the responsive admin drawer without page overflow", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "Mobile-only responsive check")
    await login(page, "admin")
    await page.getByRole("button", { name: "Открыть навигацию" }).click()
    await expect(page.getByRole("dialog", { name: "Основная навигация" })).toBeVisible()
    await page.getByRole("button", { name: "Закрыть затемнение навигации" }).click()
    await expect(page.getByRole("dialog", { name: "Основная навигация" })).toBeHidden()
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.locator("body").evaluate((node) => node.clientWidth))
  })
})
