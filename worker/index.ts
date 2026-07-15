export interface Env {
  ASSETS: Fetcher
  ENVIRONMENT: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)

    if (env.ENVIRONMENT !== 'dev') {
      return response
    }

    const headers = new Headers(response.headers)
    headers.set('X-Robots-Tag', 'noindex')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
