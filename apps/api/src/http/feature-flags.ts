import type { MiddlewareHandler } from "hono"
import type { ApiEnv } from "../auth/middleware"
import { getApiEnv } from "../env"
import { apiError } from "./errors"

type FeatureFlag = "CREATOR_FINANCE_ENABLED" | "PAYOUTS_ENABLED" | "REFERRAL_TRACKING_ENABLED" | "REFERRAL_ANALYTICS_ENABLED"

const messages: Record<FeatureFlag, string> = {
  CREATOR_FINANCE_ENABLED: "Финансовые функции временно недоступны.",
  PAYOUTS_ENABLED: "Выплаты временно отключены.",
  REFERRAL_TRACKING_ENABLED: "Отслеживание referral-событий временно отключено.",
  REFERRAL_ANALYTICS_ENABLED: "Аналитика referral-событий временно отключена.",
}

export function requireFeature(flag: FeatureFlag): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (!getApiEnv()[flag]) return apiError(c, 503, "FEATURE_DISABLED", messages[flag], { feature: flag })
    await next()
  }
}
