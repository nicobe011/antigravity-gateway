# Guia Completo de Inicialização e Uso - Antigravity Gateway

Este documento fornece o passo a passo completo para configurar, autenticar, inicializar e integrar o **Antigravity Gateway** com qualquer cliente de IA (Claude Code, Cursor, Cline, Roo Code, Continue, LibreChat, OpenAI SDK, Anthropic SDK, etc.).

---

## 📋 Sumário

1. [O que é o Antigravity Gateway](#1-o-que-é-o-antigravity-gateway)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Instalação das Dependências](#3-instalação-das-dependências)
4. [Autenticação e Gerenciamento de Contas](#4-autenticação-e-gerenciamento-de-contas)
   - [Adicionar conta via Navegador](#41-adicionar-conta-via-navegador)
   - [Adicionar conta em Servidor / VPS (Headless / Sem Navegador)](#42-adicionar-conta-em-servidor--vps-sem-navegador)
   - [Listar contas configuradas](#43-listar-contas-configuradas)
   - [Verificar e validar tokens](#44-verificar-e-validar-tokens)
   - [Menu interativo de contas](#45-menu-interativo-de-contas)
5. [Inicialização do Servidor](#5-inicialização-do-servidor)
   - [Inicialização Padrão](#51-inicialização-padrão)
   - [Inicialização com Fallback Automático](#52-inicialização-com-fallback-automático)
   - [Inicialização com Logs de Depuração (Debug)](#53-inicialização-com-logs-de-depuração-debug)
   - [Modo Desenvolvimento (Auto-reload)](#54-modo-desenvolvimento-auto-reload)
   - [Alterar a Porta do Servidor](#55-alterar-a-porta-do-servidor)
6. [Execução via Docker](#6-execução-via-docker)
7. [Endpoints Disponíveis](#7-endpoints-disponíveis)
8. [Modelos Suportados](#8-modelos-suportados)
9. [Como Conectar Clientes de IA](#9-como-conectar-clientes-de-ia)
   - [Claude Code CLI](#91-claude-code-cli)
   - [Cursor / Windsurf](#92-cursor--windsurf)
   - [Cline / Roo Code (VS Code)](#93-cline--roo-code-vs-code)
   - [Continue.dev (VS Code / JetBrains)](#94-continuedev)
   - [LibreChat](#95-librechat)
   - [cURL / Teste Rápido](#96-curl--teste-rápido)
   - [Python (OpenAI / Anthropic SDK)](#97-python-sdk)
10. [Resolução de Problemas (Troubleshooting)](#10-resolução-de-problemas-troubleshooting)

---

## 1. O que é o Antigravity Gateway

O **Antigravity Gateway** é um servidor proxy reverso universal em Node.js que expõe APIs 100% compatíveis com:
- **Anthropic API** (`/v1/messages`)
- **OpenAI API** (`/v1/chat/completions`)

Ele traduz chamadas de ambas as APIs para o protocolo do **Google Cloud Code**, permitindo usar os modelos mais avançados de IA (como Claude 4.5/4.6 com raciocínio expandido `thinking`, Gemini 3 Flash e Pro) através de contas Google com suporte a balanceamento de múltiplas contas (multi-account pool) e fallback inteligente quando cotas são atingidas.

---

## 2. Pré-requisitos

- **Node.js**: Versão 18.0.0 ou superior (recomendado Node.js 20 LTS ou 22)
- **NPM**: Versão 8+ (já incluído no Node.js)
- **Conta Google**: Pelo menos uma conta Google ativa com acesso aos serviços Cloud Code / Antigravity

Para verificar sua versão instalada:
```bash
node -v
npm -v
```

---

## 3. Instalação das Dependências

Na raiz do projeto, instale as dependências:

```bash
npm install
```

---

## 4. Autenticação e Gerenciamento de Contas

O gateway suporta múltiplas contas Google simultâneas com rotação automática (*round-robin*) para contornar limites de taxa e esgotamento de cotas.

### 4.1 Adicionar conta via Navegador
Execute o comando abaixo na sua máquina local:

```bash
npm run accounts:add
```

1. O terminal exibirá um link e tentará abrir o navegador automaticamente.
2. Faça login com sua conta Google e aprove as permissões do Cloud Code / Antigravity.
3. O servidor local na porta `51121` capturará automaticamente a autorização e salvará o refresh token seguro em `~/.config/antigravity-gateway/accounts.json`.

---

### 4.2 Adicionar conta em Servidor / VPS (Sem Navegador)
Se estiver rodando em uma máquina remota sem interface gráfica ou sem navegador:

```bash
npm run accounts:add -- --no-browser
```

1. Copie a URL do Google fornecida no terminal.
2. Abra essa URL no navegador do seu computador pessoal.
3. Faça login e autorize.
4. O navegador será redirecionado para um endereço local que não carregará (ex: `http://localhost:51121/oauth-callback?code=4/0A...`).
5. Copie a URL completa da barra de endereços (ou apenas o código após `code=`) e cole no terminal onde o comando está aguardando.

---

### 4.3 Listar contas configuradas
Para ver todas as contas cadastradas, status atual e cotas:

```bash
npm run accounts:list
```

---

### 4.4 Verificar e validar tokens
Para testar a validade dos tokens de todas as contas no pool:

```bash
npm run accounts:verify
```

---

### 4.5 Menu interativo de contas
Para adicionar, remover, testar ou alternar contas de forma interativa:

```bash
npm run accounts
```

---

## 5. Inicialização do Servidor

### 5.1 Inicialização Padrão
Inicia o gateway na porta padrão `8080`:

```bash
npm start
```

### 5.2 Inicialização com Fallback Automático (Recomendado)
Quando ativado, caso uma conta ou modelo atinja o limite de taxa (429/Resource Exhausted), o gateway automaticamente redireciona a requisição para um modelo equivalente no mesmo nível:

```bash
npm start -- --fallback
```

*Mapeamento do Fallback:*
- `gemini-3-pro-high` ➔ `claude-opus-4-5-thinking`
- `gemini-3-pro-low` ➔ `claude-sonnet-4-5`
- `gemini-3-flash` ➔ `claude-sonnet-4-5-thinking`
- `claude-opus-4-5-thinking` ➔ `gemini-3-pro-high`
- `claude-sonnet-4-5-thinking` ➔ `gemini-3-flash`

### 5.3 Inicialização com Logs de Depuração (Debug)
Mostra detalhes de conversão de payloads, payloads de entrada/saída e requisições completas:

```bash
npm start -- --debug
```

Você pode combinar os parâmetros:
```bash
npm start -- --fallback --debug
```

### 5.4 Modo Desenvolvimento (Auto-reload)
Recarrega automaticamente o servidor a cada alteração de código:

```bash
npm run dev
```

### 5.5 Alterar a Porta do Servidor
Por padrão o servidor roda na porta `8080`. Para alterar, defina a variável `PORT`:

```bash
PORT=3000 npm start
```

---

## 6. Execução via Docker

### Usando Docker Compose:
```bash
docker-compose up -d
```

### Usando Docker CLI diretamente:
```bash
# Construir imagem
docker build -t antigravity-gateway .

# Executar mapeando volume de configuração de contas e porta 8080
docker run -d \
  --name antigravity-gateway \
  -p 8080:8080 \
  -v ~/.config/antigravity-gateway:/root/.config/antigravity-gateway \
  antigravity-gateway
```

---

## 7. Endpoints Disponíveis

| Endpoint | Método | Descrição |
| :--- | :--- | :--- |
| `/health` | `GET` | Status geral do gateway, contas ativas e latência |
| `/account-limits` | `GET` | Cotas e reset time de cada conta (`?format=table` para tabela ASCII) |
| `/v1/models` | `GET` | Lista de modelos disponíveis |
| `/v1/messages` | `POST` | Endpoint nativo Anthropic (suporta streaming e thinking) |
| `/v1/chat/completions` | `POST` | Endpoint compatível com OpenAI |

### Teste de Saúde:
```bash
curl http://localhost:8080/health
```

### Ver Cotas em Tabela ASCII:
```bash
curl "http://localhost:8080/account-limits?format=table"
```

---

## 8. Modelos Suportados

### Modelos Claude:
- `claude-opus-4-6-thinking` / `claude-opus-4-5-thinking` (Claude Opus com raciocínio expandido)
- `claude-opus-4-6-low` (Claude Opus otimizado para raciocínio rápido)
- `claude-opus-4-6-medium` (Claude Opus com raciocínio equilibrado)
- `claude-opus-4-6-high` (Claude Opus com raciocínio profundo)
- `claude-sonnet-4-6` / `claude-sonnet-4-5-thinking` (Claude Sonnet com raciocínio expandido)
- `claude-sonnet-4-5` / `claude-3-7-sonnet-20250219` / `claude-3-5-sonnet-20241022`

### Modelos Gemini:
- `gemini-3-flash`
- `gemini-3-pro-low`
- `gemini-3-pro-high`

---

## 8.1 Níveis de Raciocínio do Claude (Low, Medium, High, Max)

O gateway implementa suporte nativo a **Extended Thinking (Pensamento Estendido)** e **Reasoning Effort**, permitindo calibrar o tempo de reflexão do modelo antes de entregar a resposta:

| Nível de Esforço | Orçamento de Pensamento | Para que serve? | Cenários Ideais |
| :--- | :--- | :--- | :--- |
| **`low`** | ~2.048 a 5.000 tokens | **Velocidade e economia.** Menor latência e consome menos cota. | Correções simples de bugs, dúvidas rápidas, scripts curtos e consultas diretas. |
| **`medium`** | ~8.192 a 10.000 tokens | **Equilíbrio recomendado.** Analisa o contexto com cuidado sem demorar excessivamente. | Desenvolvimento do dia a dia, criação de novas funções, testes unitários e refatorações. |
| **`high`** | ~20.000 a 32.000 tokens | **Raciocínio profundo.** Pensa passo a passo em múltiplos cenários e casos de borda. | Arquitetura de software, bugs complexos e concorrentes, algoritmos difíceis. |
| **`max`** | ~64.000 tokens | **Capacidade máxima.** Reflexão exaustiva. | Auditoria de segurança, planejamento de sistemas inteiros e deduções matemáticas complexas. |

### Como usar os níveis no seu cliente:

#### 1. Diretamente pelo Nome do Modelo (Mais simples no Cursor, Windsurf, Continue, etc.):
Basta selecionar ou digitar o modelo com o sufixo desejado:
- `claude-opus-4-6-low` ➔ Raciocínio rápido
- `claude-opus-4-6-medium` ➔ Raciocínio balanceado (Recomendado)
- `claude-opus-4-6-high` ➔ Raciocínio profundo

#### 2. Via API Anthropic / Claude Code CLI / Cline:
Você pode passar o parâmetro `thinking` com `budget_tokens` ou `effort`:
```json
{
  "model": "claude-opus-4-6-thinking",
  "thinking": {
    "type": "enabled",
    "budget_tokens": 8192
  }
}
```
Ou no objeto raiz:
```json
{
  "model": "claude-opus-4-6-thinking",
  "effort": "medium"
}
```

#### 3. Via API OpenAI (Chat Completions):
Ao chamar `/v1/chat/completions`, envie o campo `reasoning_effort`:
```json
{
  "model": "claude-opus-4-6-thinking",
  "reasoning_effort": "medium",
  "messages": [{"role": "user", "content": "Refatore esta função..."}]
}
```

---

## 9. Como Conectar Clientes de IA

### 9.1 Claude Code CLI
Para usar o Claude Code CLI apontando para o seu gateway local:

```bash
export ANTHROPIC_BASE_URL="http://localhost:8080"
export ANTHROPIC_API_KEY="antigravity"

claude
```

---

### 9.2 Cursor / Windsurf
No Cursor ou Windsurf, configure um provedor OpenAI Custom:
1. Vá em **Settings** ➔ **Models** ➔ **OpenAI API Key**.
2. **Base URL**: `http://localhost:8080/v1`
3. **API Key**: `antigravity` (qualquer valor)
4. Adicione os modelos: `claude-sonnet-4-5-thinking`, `gemini-3-pro-high`, etc.

---

### 9.3 Cline / Roo Code (VS Code)
1. Abra as configurações da extensão.
2. Selecione **API Provider**: `Anthropic-compatible` ou `OpenAI-compatible`.
   - Se escolher **Anthropic**:
     - **Base URL**: `http://localhost:8080`
     - **API Key**: `antigravity`
     - **Model ID**: `claude-sonnet-4-5-thinking`
   - Se escolher **OpenAI Compatible**:
     - **Base URL**: `http://localhost:8080/v1`
     - **API Key**: `antigravity`
     - **Model ID**: `claude-sonnet-4-5-thinking` ou `gemini-3-flash`

---

### 9.4 Continue.dev
No arquivo `~/.continue/config.json`:

```json
{
  "models": [
    {
      "title": "Claude 3.7 Sonnet (Thinking)",
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-thinking",
      "apiBase": "http://localhost:8080",
      "apiKey": "antigravity"
    },
    {
      "title": "Gemini 3 Flash",
      "provider": "openai",
      "model": "gemini-3-flash",
      "apiBase": "http://localhost:8080/v1",
      "apiKey": "antigravity"
    }
  ]
}
```

---

### 9.5 LibreChat
No arquivo `librechat.yaml`:

```yaml
endpoints:
  custom:
    - name: "Antigravity Gateway"
      apiKey: "antigravity"
      baseURL: "http://host.docker.internal:8080/v1"
      models:
        default: ["claude-sonnet-4-5-thinking", "gemini-3-pro-high", "gemini-3-flash"]
        fetch: true
      titleConvo: true
      titleModel: "gemini-3-flash"
```

---

### 9.6 cURL / Teste Rápido

#### Testando via Endpoint Anthropic:
```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: antigravity" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-5-thinking",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Olá! Quem é você?"}
    ]
  }'
```

#### Testando via Endpoint OpenAI:
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer antigravity" \
  -d '{
    "model": "gemini-3-flash",
    "messages": [
      {"role": "user", "content": "Responda apenas: Gateway funcionando!"}
    ]
  }'
```

---

### 9.7 Python SDK

#### Usando Anthropic Python SDK:
```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:8080",
    api_key="antigravity",
)

response = client.messages.create(
    model="claude-sonnet-4-5-thinking",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Explique o que é o gateway em 1 parágrafo."}],
)
print(response.content[0].text)
```

#### Usando OpenAI Python SDK:
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8080/v1",
    api_key="antigravity",
)

response = client.chat.completions.create(
    model="gemini-3-flash",
    messages=[{"role": "user", "content": "Olá mundo!"}],
)
print(response.choices[0].message.content)
```

---

## 10. Resolução de Problemas (Troubleshooting)

### 🔴 Erro: "Port 8080 is already in use"
A porta 8080 já está ocupada por outro processo. Você pode:
1. Finalizar o processo ocupando a porta: `lsof -ti :8080 | xargs kill -9`
2. Ou iniciar em outra porta: `PORT=8090 npm start`

### 🔴 Erro 401 / "Authentication failed"
O token expirou ou nenhuma conta foi cadastrada.
- Execute `npm run accounts:add` para reautenticar.
- Valide as contas com `npm run accounts:verify`.

### 🔴 Erro 429 / "Resource Exhausted" / Quota Esgotada
Seu limite gratuito temporário nessa conta foi atingido.
1. Inicie com fallback automático: `npm start -- --fallback`
2. Adicione contas secundárias para rotação automática: `npm run accounts:add`
3. Verifique o tempo restante de reset: `curl "http://localhost:8080/account-limits?format=table"`

---

Pronto! Seu **Antigravity Gateway** está configurado e pronto para uso.
