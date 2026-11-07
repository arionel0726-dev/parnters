export const avatarColorOptions = [
  { id: "monochrome", color: "#111111", foreground: "#ffffff" },
  { id: "red", color: "#ef4444", foreground: "#ffffff" },
  { id: "orange", color: "#f97316", foreground: "#ffffff" },
  { id: "yellow", color: "#f5b700", foreground: "#2b2100" },
  { id: "green", color: "#16a34a", foreground: "#ffffff" },
  { id: "blue", color: "#3b82f6", foreground: "#ffffff" },
  { id: "indigo", color: "#6366f1", foreground: "#ffffff" },
  { id: "violet", color: "#8b5cf6", foreground: "#ffffff" },
] as const

export type AvatarColorId = (typeof avatarColorOptions)[number]["id"]

export const avatarColorStorageKey = "vizaje-creator-avatar-color"
export const avatarColorEvent = "vizaje-creator-avatar-color-change"

export function subscribeToAvatarColor(callback: () => void) {
  window.addEventListener(avatarColorEvent, callback)
  window.addEventListener("storage", callback)
  return () => {
    window.removeEventListener(avatarColorEvent, callback)
    window.removeEventListener("storage", callback)
  }
}

export function getAvatarColorSnapshot(): AvatarColorId {
  const stored = window.localStorage.getItem(avatarColorStorageKey) as AvatarColorId | null
  return stored && avatarColorOptions.some((option) => option.id === stored) ? stored : "monochrome"
}

export function getServerAvatarColorSnapshot(): AvatarColorId {
  return "monochrome"
}

export function setAvatarColor(color: AvatarColorId) {
  window.localStorage.setItem(avatarColorStorageKey, color)
  window.dispatchEvent(new Event(avatarColorEvent))
}
