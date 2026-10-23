# 🔒 Diretrizes de Segurança

Este projeto foi estruturado seguindo os princípios de segurança para ambientes corporativos:

1. **Gestão de Segredos (Secrets Management):**
   - Credenciais de API, *Client Secrets* do Entra ID e tokens de acesso **nunca** são versionados no código-fonte. Utilize sempre variáveis de ambiente (`.env`) ou cofres de segredos (GitHub Secrets).

2. **Isolamento de Binários:**
   - Para evitar o vazamento de licenças corporativas ou arquivos executáveis proprietários, o repositório ignora arquivos binários (`.msi`, `.exe`, `.intunewin`). O mapeamento é feito exclusivamente por ponteiros e scripts padronizados.

3. **Princípio do Menor Privilégio:**
   - Os scripts de automação em PowerShell e os endpoints da API exigem elevação de privilégio explícita (Execução como Administrador / Contas de Serviço com permissões restritas de escrita no Intune).