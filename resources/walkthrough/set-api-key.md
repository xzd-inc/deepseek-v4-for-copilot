Use the API key issued by your configured Responses provider. The default endpoint is https://gd.yundu.lol/v1/responses; confirm it in Settings before sending a request.

- **Responses for Copilot: Set API Key** stores or updates the key in VS Code SecretStorage.
- **Responses for Copilot: Clear API Key** removes it.

Do not put the key in settings.json. This extension uses its own commands and SecretStorage; set the key again when moving from the upstream extension.
