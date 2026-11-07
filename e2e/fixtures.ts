export const fixture = {
  adminEmail: "e2e-admin@vizaje.local",
  creatorEmail: "e2e-creator@vizaje.local",
  creatorPassword: "E2E-creator-password-2026",
  adminPassword: "E2E-admin-password-2026",
  creatorId: "CRE-E2E001",
  creatorName: "E2E Creator",
  referralPartnerEmail: "e2e-referral@vizaje.local",
  applicationRejectEmail: "e2e-application-reject@vizaje.local",
  applicationApproveEmail: "e2e-application-approve@vizaje.local",
  linkLabel: "E2E Beauty homepage",
  linkCode: "E2ELINKTEST01",
}

export const stateFile = "/private/tmp/vizaje-p1.3-state.json"

export function authStorageFile(role: "admin" | "creator") {
  return `/private/tmp/vizaje-p1.3-${role}.json`
}
