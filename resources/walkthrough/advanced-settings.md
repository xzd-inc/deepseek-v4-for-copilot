在 **responses-copilot** 设置中配置 Responses 地址、模型、输出上限和提示词缓存键。

- 默认地址为 https://gd.yundu.lol/v1/responses。完整 /responses 地址直接使用，基础地址追加 /responses，需要 /v1 时请自行包含。
- 模型配置替换默认列表，只应启用端点明确支持的能力和思考强度。
- 用户配置的上下文合计限制是 272,000，预留 64,000 输出后输入预算是 208,000。更低的 maxTokens 会改变选择器中的两个生效额度。
- promptCacheKey 默认 auto，空字符串表示不发送缓存键，命中与计费取决于服务。
- 实验性稳定工具列表默认关闭，可能增加输入令牌和内部工具调用。

[打开设置](command:responses-copilot.openSettings)
