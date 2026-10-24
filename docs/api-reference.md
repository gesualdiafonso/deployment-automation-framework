# 🔌 Referência da API (FastAPI)

O microsserviço backend fornece endpoints REST para consultar e disparar ações de empacotamento e distribuição.

## Endpoints Disponíveis

### 1. Listar Pacotes Disponíveis
* **URL:** `/api/v1/packages`
* **Método:** `GET`
* **Descrição:** Lê o arquivo `source-repo-pointer.json` e retorna a lista de softwares configurados no repositório.
* **Resposta de Exemplo:**
  ```json
  {
    "status": "success",
    "packages": ["WhatsApp", "Microsoft-Office", "Google-Chrome"]
  }

# 2. Disparar Instalação via Intune Graph API
URL: /api/v1/deploy

Método: POST

Descrição: Envia uma requisição autenticada via Graph API para atribuir um aplicativo ao dispositivo do usuário.

Payload de Exemplo:

JSON
{
  "user_id": "user@domain.com",
  "device_id": "device-guid-1234",
  "app_id": "whatsapp-package-id"
}