# Responses for Copilot

<!-- marketplace-readme:remove-start -->
[English](README.md) · [更新记录](CHANGELOG.md) · [MIT](LICENSE)
<!-- marketplace-readme:remove-end -->

在 Copilot Chat 的模型选择器中使用兼容 OpenAI Responses 的端点。默认配置是 **GPT 6.1 Sol**，地址为 **https://gd.yundu.lol/v1/responses**，使用你自行提供的服务商 API Key。

本扩展是基于 [Vizards/deepseek-v4-for-copilot](https://github.com/Vizards/deepseek-v4-for-copilot) 的独立分支，遵循 MIT 许可，并在随扩展打包的 `LICENSE` 文件中保留原作者版权声明。独立安装标识为 `responses-local.responses-for-copilot`，模型提供方为 `responses-copilot`，命令和设置使用 `responses-copilot.*`，可与原扩展同时安装。`responses-local` 仅为本地打包标识，并非已注册的 Marketplace 发布者。设置和密钥独立保存；从旧版切换时，将所需设置复制到新前缀，并重新设置 API Key。

端点、模型名称、能力和令牌限制来自**用户提供的 `model.json` 配置**，并非独立验证的 OpenAI 公开模型规格。本扩展不保证与 GitHub Copilot 内置专有服务、模型行为、工具或订阅功能完全一致。端点可用性、计费、隐私和速率限制由服务商决定；这里不宣称任何模型价格。

## 开始使用

1. 使用 **VS Code 1.116 及以上版本**，并确保当前账号能够使用 Copilot Chat。提供方集成与部分模型选择器控件依赖 VS Code/Copilot API，版本升级可能影响兼容性。
2. 安装或构建 **Responses for Copilot**。
3. 在设置中核对端点后，从命令面板运行 **Responses for Copilot: 设置 API Key**，输入该端点签发的令牌。密钥通过 VS Code **SecretStorage** 保存，不写入 `settings.json`。使用 **Responses for Copilot: 清除 API Key** 可删除。请从所配置的服务商获取凭据。
4. 打开 Copilot Chat，选择 **GPT 6.1 Sol**。若模型被隐藏，打开语言模型管理器，在 **Responses for Copilot** 提供方下显示它。模型的配置菜单可选择思考强度。

这些配置不会主动查找凭据，也未通过真实端点请求验证模型能力。发送代码、提示词或图片前，请自行了解服务商。

## 配置

以下完整 `settings.json` 示例重现默认端点配置：

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

- `models` 会**替换**可选模型列表，`[]` 可隐藏全部模型。每项必须提供 `id` 及有限正整数的输入、输出限制。名称、系列、版本和详情属于可选显示信息。自定义模型的能力默认关闭，只应启用后端明确支持的能力。`imageInput: true` 表示 Responses 原生图片输入，不经过视觉代理。
- 用户提供的配置还包含 `gpt-6-sol` 和 `gpt-5.6-sol`。需要时可添加对应 ID、名称和版本的配置，仅在适用于该服务时沿用所提供的限制和思考强度。两者不会自动启用。旧版 DeepSeek 模型不会成为默认 Responses 模型。
- `modelIdOverrides` 可为任意选择器模型 ID 指定实际发送的 API ID，例如 `{"gpt-6.1-sol": "your-deployment-id"}`。它只改变发送的名称，不改变能力或限制。
- `requestHeaders` 用于额外的服务商请求头。凭据应存入 SecretStorage，不要写进设置文件。

### 端点地址处理

配置会去除首尾空白和末尾斜杠。以 `/responses` 结尾的 URL 直接使用，其余地址由客户端追加 `/responses`。服务商要求 `/v1` 时，请自行在地址中包含它：

| 设置值 | 请求地址 |
|---|---|
| `https://gd.yundu.lol/v1/responses` | `https://gd.yundu.lol/v1/responses` |
| `https://gd.yundu.lol/v1/` | `https://gd.yundu.lol/v1/responses` |
| `https://api.openai.com/v1` | `https://api.openai.com/v1/responses` |

修改域名不会让模型 ID 自动在新服务上可用；请同时配置该服务支持的模型和能力。主提供方**只使用 Responses 协议**，Chat Completions 或旧版 DeepSeek API 地址不会触发协议回退。URL 必须为 HTTP(S)，不能包含嵌入的凭据、查询参数或片段。

### 上下文与输出限制

用户配置声明 `maxInputTokens: 272000` 和 `maxOutputTokens: 64000`。这里将 **272,000 视为输入与输出合计的上下文上限**，因此同时设置 `contextWindowTokens: 272000`。预留默认的 64,000 输出额度后，选择器中的**输入预算为 208,000 tokens**，不能将其理解为 272,000 输入再加 64,000 输出。

`maxTokens: 0` 使用模型配置的输出上限。正整数会进一步限制输出，且不会超过模型上限。例如 `maxTokens: 16000` 会显示最多 16,000 输出和 256,000 输入。模型或输出限制修改后会刷新选择器。对其他服务，请填写其输入与输出合计的 `contextWindowTokens`；只有在输入和输出限制确实能够独立使用时才省略该字段。令牌估算并非权威 tokenizer，后端还可能施加更低限制，包括推理或图片的令牌开销。

### 思考强度

默认配置允许 `low`、`medium`、`high`、`xhigh`、`max`，默认值为 **high**。可在模型选择器中选择，或修改模型配置的 `defaultReasoningEffort`。自定义模型必须列出所支持的强度，并从中选择默认值。显式指定不支持的值会报错，不会静默回退或提升强度。

请求集成可使用 `modelOptions.reasoningEffort`，也接受嵌套的 `modelOptions.reasoning.effort` 和 `thinkingLevel` 兼容别名。旧版 `modelConfiguration` 与 `configuration` 仍可读取，请求级 `modelOptions` 优先。

默认配置**不提供 `none`**。只有后端明确支持停用推理时，才应设置 `canDisableReasoning: true`。强度标签表示请求参数，不保证响应质量或延迟。

### 缓存键与无状态重放

`promptCacheKey: "auto"` 基于模型 ID 和系统前缀的哈希生成稳定的键，键中不发送提示词原文。自定义字符串会作为 `prompt_cache_key` 发送，空字符串 `""` 则不发送该字段。缓存是否可用、保留时长、命中和计费均由后端决定；设置键不保证命中或降价。

Responses 请求使用 `store: false` 并请求加密推理内容。完整且有序的 Responses 输出项列表——包括加密推理项、助手消息和函数调用——会保存到对话重放元数据中，并非仅保存界面显示的推理摘要。重放会保留推理项相对于助手消息和函数调用的原始位置，工具结果则以函数调用输出项提供，因此后续轮次无需依赖服务端的 `previous_response_id`。这要求端点能够返回并接受兼容的加密推理项。编辑历史、切换端点或模型、丢失宿主重放元数据都可能影响连续性，必要时请新建对话。推理内容加密不代表其余对话对端点不可见。

## 兼容性与诊断

默认用户配置启用原生图片和函数工具请求。具体可用工具、Instructions、MCP 集成和 Agent 界面由 Copilot 决定；本扩展无法重现内置提供方的全部能力，也不保证每种工具流程完全一致。本扩展没有运行时包依赖，不需要单独运行代理进程。

`responses-copilot.debugMode` 默认是 `minimal`。`metadata` 增加诊断元数据，分享前请检查内容。`verbose` 会写入完整的本地请求 dump，可能包含提示词、源代码、图片、工具定义和重放状态。使用 **Responses for Copilot: 打开请求 Dump 目录** 查看文件，使用 **Responses for Copilot: 显示日志** 查看诊断。

视觉代理命令和设置为兼容性保留，原生图片模型不需要代理。`experimental.stabilizeToolList` 默认关闭，可能增加输入令牌和内部预检调用，不保证提高后端缓存命中率。

## 开发

使用 **Node.js 24 及以上版本**，运行 `npm ci`、`npm run compile` 和 `npm test`。原有 `lint`、`format` 与 `format:check` 脚本保持可用。`npm run vscode:prepublish` 准备商店 README 并编译；`npm run package` 在 `dist/` 生成 VSIX。
