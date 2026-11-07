import { expect, test } from "@playwright/test"
import { fixture } from "./fixtures"
import { login } from "./helpers"

test.describe("creator portal", () => {
  test("renders the dashboard and navigates between creator pages", async ({ page }) => {
    await login(page, "creator")
    if (test.info().project.name === "mobile") {
      await expect(page.getByText("Доступно к выплате")).toBeVisible()
    } else {
      await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible()
    }
    await page.getByRole("link", { name: test.info().project.name === "mobile" ? "Ссылки" : "Мои ссылки" }).first().click()
    await expect(page).toHaveURL(/\/dashboard\/links/)
    await expect(page.getByRole("heading", { name: "Мои ссылки" })).toBeVisible()
    await page.getByRole("link", { name: "Заказы" }).first().click()
    await expect(page).toHaveURL(/\/dashboard\/orders/)
    await expect(page.getByText(/временно недоступ|недоступны|финансовые функции пока отключены/i)).toBeVisible()
  })

  test("searches, filters, copies and displays a QR code for a referral link", async ({ page }) => {
    await login(page, "creator")
    await page.goto("/dashboard/links")
    const visibleLinkLabel = page.locator(`h2:visible, strong[title="${fixture.linkLabel}"]:visible`).filter({ hasText: fixture.linkLabel }).first()
    await expect(visibleLinkLabel).toBeVisible()
    const search = page.locator("input[type=search]")
    await search.fill("E2E Beauty")
    await expect(visibleLinkLabel).toBeVisible()
    await page.locator("button.partner-links-quick-copy:visible, button[title='Копировать']:visible").first().click()
    await expect(page.getByRole("button", { name: /Скопировано/ }).first()).toBeVisible()
    if (test.info().project.name === "mobile") {
      await page.locator("button.partner-links-mobile-next:visible").first().click()
      await page.getByRole("menuitem", { name: "QR" }).click()
    } else {
      await page.locator("button[title='QR']:visible").first().click()
    }
    await expect(page.getByRole("heading", { name: "QR-код ссылки" })).toBeVisible()
    await expect(page.getByRole("img", { name: new RegExp(fixture.linkLabel) })).toBeVisible()
  })

  test("creates and revokes a link through the M4 local flow", async ({ page }) => {
    test.skip(test.info().project.name === "mobile", "Mutating link scenario runs once on desktop")
    await login(page, "creator")
    await page.goto("/dashboard/links")
    await page.getByRole("button", { name: "Создать ссылку" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await dialog.locator("input[type=url]").fill("https://vizaje-nica.com/ru/")
    await dialog.locator("input[placeholder]").last().fill(`E2E created ${Date.now()}`)
    await dialog.getByRole("button", { name: "Создать ссылку" }).click()
    await expect(page.getByRole("heading", { name: "Ссылка создана" })).toBeVisible()
    await page.locator('[data-slot="dialog-close"]').last().click()
    const createdRow = page.locator("tr").filter({ has: page.locator("strong[title^='E2E created']") }).first()
    await expect(createdRow).toBeVisible()
    await createdRow.getByRole("button").last().click()
    await page.getByRole("menuitem", { name: "Отозвать" }).click()
    const revokeDialog = page.getByRole("dialog")
    await expect(revokeDialog.getByRole("heading", { name: "Отозвать ссылку?" })).toBeVisible()
    await revokeDialog.getByRole("button", { name: "Отозвать ссылку" }).click()
    await expect(createdRow.getByText("Отозванные")).toBeVisible()
  })

  test("shows an honest disabled state for creator finance and payouts", async ({ page }) => {
    await login(page, "creator")
    for (const path of ["/dashboard/earnings", "/dashboard/payouts"]) {
      await page.goto(path)
      await expect(page.getByText(/временно недоступ|недоступны|финансовые функции пока отключены/i)).toBeVisible()
      await expect(page.getByRole("button", { name: /Запросить выплату|Получить выплату/i })).toHaveCount(0)
    }
  })

  test("renders the creator mobile bottom navigation without horizontal overflow", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "Mobile-only responsive check")
    await login(page, "creator")
    await expect(page.getByRole("navigation").last()).toBeVisible()
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.locator("body").evaluate((node) => node.clientWidth))
  })
})
