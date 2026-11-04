import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { Context } from "hono"

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(
    {
      status: "error",
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  )
}

