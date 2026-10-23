# 🏛️ Arquitetura do Sistema - Enterprise Deployment Automation

Este documento descreve a arquitetura lógica e o fluxo de dados do framework de automação de empacotamento e distribuição de softwares.

## 🔄 Fluxo Geral de Operação

```text
[ Solicitação / Portal Web ] 
         │ (FastAPI / REST API)
         ▼
[ Microsoft Graph API & OAuth2 ]
         │ 
         ├────────────────────────────────┐
         ▼                                ▼
[ Microsoft Intune (Nuvem) ]    [ SCCM / ConfigMgr (On-Premises) ]
         │                                │
         └───────────────┬────────────────┘
                         ▼
             [ Estação de Trabalho do Usuário ]
             (Company Portal / Software Center)
                         │
                         ▼ (Fallback / Rede Local)
                 [ Compartilhamento \\eds\temp ]
```

# 🧩 Componentes Principais
Camada de Repositório de Mídias (packages/):
Centraliza os scripts de automação baseados em PSAppDeployToolkit (PSADT).
Utiliza o arquivo source-repo-pointer.json para mapear de forma dinâmica onde buscar instaladores (seja em servidores locais de rede como \\eds\temp\Software ou repositórios externos via winget).
Camada de Backend (portal-backend/):
Desenvolvida em Python com FastAPI.
Expõe endpoints REST que se comunicam com a Microsoft Graph API utilizando autenticação segura via OAuth2 (Client Credentials) para automatizar o gerenciamento de pacotes e dispositivos.
Camada de Remediação (scripts/):
Scripts em PowerShell focados em corrigir falhas comuns de agentes locais nas estações de trabalho, realizando a limpeza de cache corrompido (ccmcache) e reinício de serviços críticos (CcmExec, IntuneManagementExtension).

---