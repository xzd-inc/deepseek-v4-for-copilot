# Responses for Copilot

<!-- marketplace-readme:remove-start -->
[简体中文](README.zh-cn.md) · [Changelog](CHANGELOG.md) · [MIT](LICENSE)
<!-- marketplace-readme:remove-end -->

Use an OpenAI Responses-compatible endpoint from the Copilot Chat model picker. The default is **GPT 6.1 Sol** at **https://gd.yundu.lol/v1/responses**, using your own provider API key.

This independent fork is based on [Vizards/deepseek-v4-for-copilot](https://github.com/Vizards/deepseek-v4-for-copilot) under the MIT license; the original copyright notice is preserved in the bundled `LICENSE` file. Its local installation ID is `responses-local.responses-for-copilot`, its model vendor is `responses-copilot`, and its commands and settings use `responses-copilot.*`. It can coexist with the upstream extension. `responses-local` is a local packaging identifier, not a registered Marketplace publisher. Settings and API keys are separate: copy desired settings to the new prefix and set the API key again.

The endpoint, model names, capabilities, and token bounds come from a **user-supplied `model.json` profile**. They are not independently verified public OpenAI model specifications. This provider does not guarantee parity with GitHub Copilot's built-in proprietary service, model behavior, tools, or subscription features. Endpoint availability, billing, privacy, and rate limits are controlled by your provider; no model prices are advertised here.

## Setup

1. Use VS Code **1.116 or later** with Copilot Chat available to your account. Provider integration and some picker controls depend on VS Code/Copilot APIs and may change between releases.
2. Install or build **Responses for Copilot**.
3. Review the endpoint in Settings, then run **Responses for Copilot: Set API Key** from the Command Palette. Enter the token issued for that endpoint. It is stored through VS Code **SecretStorage**, not in `settings.json`. Use **Responses for Copilot: Clear API Key** to remove it. Obtain credentials from your configured provider.
4. Open Copilot Chat and select **GPT 6.1 Sol**. If hidden, open **Chat: Manage Language Models**, find the **Responses for Copilot** provider, and show the model. Open its model configuration to choose a reasoning effort.

No credential discovery or live endpoint verification is performed by this configuration. Review a provider before sending code, prompts, or images to it.

## Configuration

This complete `settings.json` example reproduces the default endpoint profile:

```json
{
  "responses-copilot.baseUrl": "https://gd.yundu.lol/v1/responses",
  "responses-copilot.models": [
    {
      "id": "gpt-6.1-sol",
      "name": "GPT 6.1 Sol",
      "family": "gpt",
      "version": "6.1-sol",
      "maxInputTokens": 272000,
      "maxOutputTokens": 64000,
      "contextWindowTokens": 272000,
      "toolCalling": true,
      "imageInput": true,
      "thinking": true,
      "supportedReasoningEfforts": ["low", "medium", "high", "xhigh", "max"],
      "defaultReasoningEffort": "high",
      "canDisableReasoning": false
    }
  ],
  "responses-copilot.maxTokens": 0,
  "responses-copilot.promptCacheKey": "auto",
  "responses-copilot.modelIdOverrides": {},
  "responses-copilot.requestHeaders": {}
}
```

- `models` **replaces** the selectable list; `[]` hides all models. Each entry requires an `id` and finite positive integer input/output bounds. Name, family, version, and detail are optional display metadata. Capabilities are opt-in for custom entries: declare only what that endpoint supports. `imageInput: true` means native Responses image input, without Vision Proxy.
- The supplied profile also names `gpt-6-sol` and `gpt-5.6-sol`. To expose either, add a profile with that ID and its matching name/version, using the supplied bounds and supported efforts only if they apply to your service. Neither is enabled implicitly. Old DeepSeek model profiles are not default Responses models.
- `modelIdOverrides` maps any picker model ID to a different API model ID, for example `{"gpt-6.1-sol": "your-deployment-id"}`. It changes only the transmitted name, not the advertised capabilities or limits.
- `requestHeaders` adds provider-specific headers. Keep credentials in SecretStorage rather than in settings.

### Endpoint handling

Whitespace and trailing slashes are removed. A URL ending in `/responses` is used directly; otherwise the client appends `/responses`. Include `/v1` yourself when your provider requires it:

| Setting | Request URL |
|---|---|
| `https://gd.yundu.lol/v1/responses` | `https://gd.yundu.lol/v1/responses` |
| `https://gd.yundu.lol/v1/` | `https://gd.yundu.lol/v1/responses` |
| `https://api.openai.com/v1` | `https://api.openai.com/v1/responses` |

Changing the host does not make a model ID valid there. Configure the model IDs and capabilities supported by that service. The main provider sends **Responses only**; a Chat Completions endpoint or an old DeepSeek API address is not a protocol fallback. URLs must use HTTP(S) without embedded credentials, queries, or fragments.

### Context and output limits

The supplied profile declares `maxInputTokens: 272000` and `maxOutputTokens: 64000`. Because **272,000 is treated as the total input-plus-output context bound**, `contextWindowTokens` is also set to 272,000. Reserving the default 64,000 output allowance yields a **208,000-token input budget** in the picker, not 272,000 input plus 64,000 output.

`maxTokens: 0` uses the model's output bound. A positive integer further caps output and cannot increase it above the profile limit. For example, `maxTokens: 16000` advertises 16,000 output and at most 256,000 input for this context window. Model and output-limit changes refresh the picker. For other services, set `contextWindowTokens` to their total context bound; omit it only when the service's input and output limits are independently usable. Token estimation is not an authoritative tokenizer, and the backend can impose smaller limits, including reasoning or image token overhead.

### Reasoning effort

The supplied profile enables `low`, `medium`, `high`, `xhigh`, and `max`, with **high** as its default. Select an effort from the model picker, or change `defaultReasoningEffort` in that model's settings. A custom profile must list its supported efforts and choose a default from that list. Unsupported explicit effort values fail clearly rather than silently falling back or escalating.

Request integrations can provide `modelOptions.reasoningEffort`; nested `modelOptions.reasoning.effort` and `thinkingLevel` are accepted compatibility aliases. Legacy `modelConfiguration` and `configuration` options remain readable. Request-scoped `modelOptions` take precedence.

The default profile does **not** offer `none`. Set `canDisableReasoning: true` only if the backend explicitly supports disabling reasoning. Effort labels describe request options; they do not guarantee quality or latency.

### Cache key and stateless replay

`promptCacheKey: "auto"` derives a stable key from the model ID and a hash of the system prefix, without sending prompt plaintext as the key. A custom string is sent as `prompt_cache_key`; an empty string `""` omits that field. Cache availability, retention, hits, and billing depend on the backend. A key does not guarantee a cache hit or lower cost.

Responses requests use `store: false` and request encrypted reasoning content. The full ordered Responses output item list—including encrypted reasoning items, assistant messages, and function calls—is saved in conversation replay metadata, not just the displayed reasoning summary. Replay preserves reasoning placement relative to assistant messages and function calls, with tool results supplied as function-call outputs, so later turns can continue without relying on a server-side `previous_response_id`. This requires the endpoint to return and accept compatible encrypted reasoning items. Editing history, switching endpoints/models, or losing host replay metadata can interrupt continuity; start a new conversation if necessary. Encryption of reasoning content does not make the rest of the conversation private from the endpoint.

## Compatibility and diagnostics

Native image and function-tool requests are enabled by the supplied profile. Copilot controls which tools, instructions, MCP integrations, and agent UI are available; this extension cannot reproduce every built-in provider feature or guarantee that every tool workflow works identically. It has no runtime package dependencies or separate proxy process.

`responses-copilot.debugMode` defaults to `minimal`. `metadata` adds diagnostic metadata; review it before sharing. `verbose` writes full local request dumps that may contain prompts, source code, images, tool schemas, and replay state. Open them with **Responses for Copilot: Open Request Dumps Folder**. Use **Responses for Copilot: Show Logs** for diagnostics.

The Vision Proxy commands/settings are retained for compatibility; native-image profiles do not need them. `experimental.stabilizeToolList` remains disabled by default; it may add input tokens and internal preflight calls, and backend cache improvements are not guaranteed.

## Development

Use Node.js **24 or later**. Run `npm ci`, `npm run compile`, and `npm test`. Existing `lint`, `format`, and `format:check` scripts remain available. `npm run vscode:prepublish` prepares the marketplace README and compiles; `npm run package` creates a VSIX in `dist/`.
