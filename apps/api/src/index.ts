import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.json({
    name: 'Vizaje Partners API',
    version: '0.1.0',
  })
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'vizaje-partners-api',
  })
})

export default {
  port: 3001,
  fetch: app.fetch,
}
