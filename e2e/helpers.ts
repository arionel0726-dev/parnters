import { expect, type Page } from "@playwright/test"
import { fixture } from "./fixtures"

let loginSequence = 0
const testRunIpOctet = Math.floor(Math.random() * 250)

export async function useIsolatedTestIp(page: Page) {
  loginSequence += 1
  const testIp = `198.18.${testRunIpOctet}.${(loginSequence % 250) + 1}`
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": testIp })
}

export async function login(page: Page, role: "admin" | "creator") {
  await useIsolatedTestIp(page)
  const email = role === "admin" ? fixture.adminEmail : fixture.creatorEmail
  const password = role === "admin" ? fixture.adminPassword : fixture.creatorPassword
  const destination = role === "admin" ? "/app" : "/dashboard"

  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(2_000)
  const emailInput = page.locator("#email")
  await expect(emailInput).toBeEditable()
  await emailInput.fill(email)
  await expect(emailInput).toHaveValue(email)
  await page.locator("form.auth-login-form button[type=submit]").click()
  const passwordInput = page.locator("#password")
  await expect(passwordInput).toBeEnabled()
  await passwordInput.fill(password)
  await page.locator("form.auth-login-form button[type=submit]").click()
  await expect(page).toHaveURL(new RegExp(`${destination.replace("/", "\\/")}(?:$|\\?)`))
  await expect(page.locator("main")).toBeVisible()
}

export async function openProfileAndLogout(page: Page) {
  const profileButton = page.getByRole("button", { name: /Профиль/ }).last()
  if (await profileButton.isVisible().catch(() => false)) await profileButton.click()
  await page.getByRole("button", { name: "Выйти" }).last().click()
  await expect(page).toHaveURL(/\/login(?:$|\?)/)
}
