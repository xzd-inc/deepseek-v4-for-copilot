使用所配置 Responses 服务商签发的 API Key。默认端点是 https://gd.yundu.lol/v1/responses；发送请求前请在设置中确认地址。

- **DeepSeek: 设置 API Key** 通过 VS Code SecretStorage 保存或更新密钥。
- **DeepSeek: 清除 API Key** 删除密钥。
- 保留的 **DeepSeek: 获取 API Key** 命令打开 DeepSeek 网站，并非默认第三方服务商。

不要将密钥写进 settings.json。现有命令 ID 保留 DeepSeek 前缀以兼容既有集成。
