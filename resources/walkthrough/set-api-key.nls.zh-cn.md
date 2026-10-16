使用所配置 Responses 服务商签发的 API Key。默认端点是 https://gd.yundu.lol/v1/responses；发送请求前请在设置中确认地址。

- **Responses for Copilot: 设置 API Key** 通过 VS Code SecretStorage 保存或更新密钥。
- **Responses for Copilot: 清除 API Key** 删除密钥。

不要将密钥写进 settings.json。本扩展使用独立命令和 SecretStorage；从原扩展切换时需重新设置密钥。
