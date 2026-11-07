import { expect, test } from "@playwright/test"
import { login, openProfileAndLogout, useIsolatedTestIp } from "./helpers"
import { fixture } from "./fixtures"

test.describe("authentication", () => {
  test("redirects unauthenticated users and rejects an invalid password", async ({ page }) => {
    await page.goto("/app")
    await expect(page).toHaveURL(/\/login(?:$|\?)/)
    await page.waitForTimeout(2_000)
    const emailInput = page.locator("#email")
    await expect(emailInput).toBeEditable()
    await emailInput.fill(fixture.adminEmail)
    await expect(emailInput).toHaveValue(fixture.adminEmail)
    await page.locator("form.auth-login-form button[type=submit]").click()
    const passwordInput = page.locator("#password")
    await expect(passwordInput).toBeEnabled()
    await passwordInput.fill("wrong-password-2026")
    await page.locator("form.auth-login-form button[type=submit]").click()
    await expect(page.getByRole("alert").filter({ hasText: /неверн|invalid/i }).first()).toBeVisible()
  })

  test("keeps a creator session after reload and logs out through the profile control", async ({ page }) => {
    await login(page, "creator")
    await expect(page).toHaveURL(/\/dashboard(?:$|\?)/)
    await page.reload()
    await expect(page).toHaveURL(/\/dashboard(?:$|\?)/)
    await openProfileAndLogout(page)
  })

  test("keeps forgot-password responses non-enumerating", async ({ page }) => {
    await useIsolatedTestIp(page)
    await page.goto("/forgot-password")
    const form = page.locator("form")
    await form.locator("input[type=email]").fill(fixture.adminEmail)
    await form.locator("button[type=submit]").click()
    await expect(page.locator("#recovery-success, #recovery-error")).toBeVisible()
    const unknownPage = await page.context().newPage()
    await unknownPage.goto("/forgot-password")
    await unknownPage.locator("form input[type=email]").fill("unknown-e2e@vizaje.local")
    await unknownPage.locator("form button[type=submit]").click()
    await expect(unknownPage.locator("#recovery-success, #recovery-error")).toBeVisible()
    const knownText = await page.locator("form").innerText()
    const unknownText = await unknownPage.locator("form").innerText()
    expect(unknownText).toBe(knownText)
    await unknownPage.close()
  })

  test("does not accept an invalid reset token", async ({ page }) => {
    await page.goto("/reset-password?token=e2e-invalid-token")
    await expect(page.locator("form")).toBeVisible()
    await page.locator("form input[type=password]").first().fill("New-e2e-password-2026")
    const secondPassword = page.locator("form input[type=password]").nth(1)
    if (await secondPassword.count()) await secondPassword.fill("New-e2e-password-2026")
    await page.locator("form button[type=submit]").click()
    await expect(page.getByRole("alert").filter({ hasText: /сброс|недейств|истёк|ошиб/i }).first()).toBeVisible()
  })
})
