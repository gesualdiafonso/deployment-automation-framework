# 🛠️ Guia de Troubleshooting & Resolução de Erros

Guia técnico para diagnóstico e remediação rápida de falhas comuns em instalações corporativas via SCCM / Intune.

---

### ❌ Erro 1: Instalação travada ou falha com código `1603` (Generic MSI Error)
* **Causa Raiz:** O instalador encontrou um conflito de arquivos em uso, permissões insuficientes ou uma tentativa anterior corrompida.
* **Resolução via Terminal (PowerShell como Admin):**
  ```powershell
  # Parar o serviço do SCCM e limpar o cache travado
  Stop-Service -Name "CcmExec" -Force
  Remove-Item -Path "C:\Windows\ccmcache\*" -Recurse -Force -ErrorAction SilentlyContinue
  Start-Service -Name "CcmExec"
  ```

# ❌ Erro 0x80070002: Arquivo não encontrado (File Not Found)
Causa Raiz: O agente do Intune/SCCM não conseguiu localizar o caminho de origem do arquivo descompactado no cache local (IMECache) ou o caminho de rede \\eds\temp está inacessível.

## Resolução:

Validar a conectividade com a rede corporativa.

Executar o script de reconfiguração do agente do Intune:

```PowerShell
Restart-Service -Name "IntuneManagementExtension" -Force
```
## ❌ Falha no Software Center / Agente SCCM corrompido
Resolução por Contorno Local:
Acessar o repositório de rede de contingência (\\eds\temp\Software), copiar o pacote localmente para C:\temp\ e executar o script de instalação automatizada (install.ps1) com privilégios de Administrador.