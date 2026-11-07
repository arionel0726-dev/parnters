import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { fixture, stateFile } from "./fixtures"
import { login } from "./helpers"

test.describe("notification center", () => {
  test("shows the bell, unread counter and recent notification dropdown for a creator", async ({ page }) => {
    test.skip(test.info().project.name === "desktop", "Creator bell is rendered in the responsive creator header")
    await login(page, "creator")
    const bell = page.getByRole("button", { name: "Уведомления" })
    await expect(bell).toBeVisible()
    await expect(bell.locator("span").first()).toHaveText(/\d+/)
    await bell.click()
    const dropdown = page.getByRole("dialog", { name: "Уведомления" })
    await expect(dropdown).toBeVisible()
    await expect(dropdown.getByText("E2E notification 25")).toBeVisible()
    await dropdown.getByRole("button", { name: "Отметить как прочитанное" }).first().click()
    await expect(dropdown.getByText("E2E notification 25")).toBeVisible()
    await dropdown.getByRole("link", { name: "Все уведомления" }).click()
    await expect(page).toHaveURL(/\/dashboard\/notifications/)
    await expect(page.getByRole("heading", { name: "Уведомления" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Далее" })).toBeVisible()
  })

  test("supports mark-all and prevents cross-user notification access", async ({ page }) => {
    test.skip(test.info().project.name === "mobile", "Mark-all control is desktop-only in the notifications page")
    await login(page, "admin")
    await page.goto("/app/notifications")
    await expect(page.getByRole("heading", { name: "Уведомления" })).toBeVisible()
    await page.getByRole("button", { name: "Прочитать все" }).click()
    await expect(page.getByText(/непрочитан/i)).toHaveCount(0)
    const state = JSON.parse(await readFile(stateFile, "utf8")) as { notificationIds: string[] }
    const creatorNotificationId = state.notificationIds.at(-1)
    expect(creatorNotificationId).toBeTruthy()
    const crossUserStatus = await page.evaluate(async (id) => {
      const response = await fetch(`/api/notifications/${id}/read`, { method: "POST" })
      return response.status
    }, creatorNotificationId)
    expect(crossUserStatus).toBe(404)
  })

  test("shows an empty-safe notification surface for the admin mobile viewport", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "Mobile-only responsive check")
    await login(page, "admin")
    await page.goto("/app/notifications")
    await expect(page.getByRole("main").last()).toBeVisible()
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.locator("body").evaluate((node) => node.clientWidth))
  })
})
