class ProxyError extends Error {
  constructor(statusCode, type, message) {
    super(message)
    this.statusCode = statusCode
    this.type = type
  }

  toAnthropic() {
    return {
      type: 'error',
      error: {
        type: this.type,
        message: this.message,
      },
    }
  }
}

function mapUpstreamError(statusCode, body) {
  if (statusCode === 400) {
    const msg = body?.error?.message || body?.message || 'Bad request'
    if (msg.includes('reasoning_content') || msg.includes('thinking mode')) {
      return new ProxyError(400, 'invalid_request_error',
        'The reasoning content from a previous thinking-mode response must be passed back. ' +
        'Ensure assistant messages with tool calls include their reasoning_content field.')
    }
    return new ProxyError(400, 'invalid_request_error', msg)
  }
  if (statusCode === 401) return new ProxyError(401, 'authentication_error', 'Invalid API key')
  if (statusCode === 429) return new ProxyError(429, 'rate_limit_error', 'Rate limit exceeded')
  if (statusCode >= 500) return new ProxyError(502, 'upstream_error', 'Upstream server error')
  return new ProxyError(502, 'upstream_error', `Upstream returned ${statusCode}`)
}

module.exports = { ProxyError, mapUpstreamError }
