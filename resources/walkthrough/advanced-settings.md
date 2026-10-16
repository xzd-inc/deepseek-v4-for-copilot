Configure the Responses URL, models, output cap, and prompt cache key under **deepseek-copilot** in Settings.

- The default URL is https://gd.yundu.lol/v1/responses. Full /responses URLs are kept; other base URLs have /responses appended. Include /v1 where needed.
- Model profiles replace the defaults. Only enable capabilities and reasoning efforts supported by your endpoint.
- The supplied 272,000 total context bound reserves 64,000 output tokens, leaving a 208,000 input budget. A lower maxTokens cap changes both effective picker budgets.
- promptCacheKey defaults to auto; an empty string omits the cache key. Hits and billing depend on the service.
- Experimental tool-list stabilization is off by default and may add input tokens and internal tool calls.

[Open settings](command:deepseek-copilot.openSettings)
