# Plataforma SaaS de Aquecimento de WhatsApp

## Visão geral

Transformar o projeto atual em um SaaS multi-tenant onde cada cliente:
1. Cria sua conta e assina um plano
2. Conecta seus números de WhatsApp via QR Code
3. Configura grupos de aquecimento (números que conversam entre si)
4. Deixa o sistema trocar mensagens automaticamente em intervalos aleatórios

O aquecimento em si é executado por uma **Evolution API** self-hosted (você contrata VPS). Nosso painel Lovable é o cérebro: agenda, controla, exibe status e cobra.

## Arquitetura

```text
┌─────────────────┐        ┌──────────────────┐        ┌──────────────┐
│  Painel Lovable │───────▶│  Evolution API   │───────▶│  WhatsApp    │
│  (SaaS + Auth   │  REST  │  (VPS Docker)    │   WS   │  (via QR)    │
│   + Cron)       │◀───────│                  │◀───────│              │
└─────────────────┘        └──────────────────┘        └──────────────┘
        │
        ▼
   Lovable Cloud
   (DB, Auth, Cron)
```

**Fluxo de aquecimento:**
- Cron a cada 1–5 min → busca grupos ativos → escolhe par (A→B) aleatório → envia texto de um pool → registra log → aguarda intervalo aleatório.

## Escopo desta primeira entrega

### 1. Substituir o painel atual (leads) pelo de aquecimento
Removeremos as telas/tabelas de leads (mantendo auth e user_roles) e reaproveitamos o esqueleto.

### 2. Modelo de dados
- `plans` — planos (Free/Starter/Pro): limite de números, mensagens/dia
- `subscriptions` — assinatura do cliente
- `whatsapp_instances` — número conectado (nome, evolution_instance_id, status, phone, qr, owner)
- `warmup_groups` — grupo de aquecimento (nome, owner, min_delay, max_delay, msgs_per_day, ativo)
- `warmup_group_members` — instâncias que participam do grupo
- `message_templates` — banco de textos naturais (bom dia, oi, kk, emoji, etc)
- `warmup_logs` — histórico (from, to, texto, timestamp, status)

RLS: cada cliente só vê seus próprios registros. Admin vê tudo.

### 3. Telas do cliente
- `/app` — Dashboard: nº de instâncias, mensagens enviadas hoje, saúde de cada chip
- `/app/instances` — Listar / Adicionar (dispara criação na Evolution + mostra QR Code em modal) / Reconectar / Deletar
- `/app/groups` — Criar grupos de aquecimento, escolher membros, definir frequência/horário
- `/app/logs` — Últimas mensagens trocadas
- `/app/plan` — Plano atual, upgrade (Stripe depois)

### 4. Telas do admin
- Listar clientes, planos, uso, alterar plano manualmente
- Configurar URL/API Key da Evolution API global
- Gerenciar pool global de mensagens padrão

### 5. Integração Evolution API
Server functions (`createServerFn`) chamando REST da Evolution:
- `POST /instance/create`
- `GET /instance/connect/{instance}` → retorna QR base64
- `GET /instance/connectionState/{instance}`
- `POST /message/sendText/{instance}` → envia texto
- `DELETE /instance/delete/{instance}`

Secrets: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` (você me passa depois do VPS pronto).

### 6. Motor de aquecimento
`pg_cron` a cada 1 min → chama server route `/api/public/hooks/warmup-tick`:
1. Busca grupos ativos onde `next_run_at <= now()`
2. Para cada grupo: sorteia par de membros conectados, sorteia texto, chama Evolution para enviar
3. Registra log e agenda próximo `next_run_at` = now + random(min_delay, max_delay)
4. Respeita limite diário do plano e horário comercial configurado

## Detalhes técnicos

- **Backend**: TanStack Start server functions + server routes (edge). Sem edge functions Supabase.
- **Cron**: `pg_cron` + `pg_net` chamando `/api/public/hooks/warmup-tick` autenticado por `apikey` header (anon key).
- **QR Code**: Evolution retorna base64; renderizamos em `<img>` num modal com polling do `connectionState` até `open`.
- **Auth**: mantém o atual (email+senha auto-cadastro). Primeiro user = admin.
- **Multi-tenant**: coluna `owner_id` em todas as tabelas + RLS por `auth.uid()`.
- **Naming de instância na Evolution**: `{user_id}_{slug}` para evitar colisão entre clientes.

## Pré-requisitos que dependem de você

1. Provisionar VPS com Evolution API rodando (posso te passar um guia Docker Compose de 10 linhas depois — não preciso agora).
2. Ter em mãos: `EVOLUTION_API_URL` (ex: `https://evo.seudominio.com`) e `EVOLUTION_API_KEY`.
3. Definir os planos iniciais (ex: Starter 3 chips / 40 msgs dia; Pro 10 chips / 150 msgs dia). Se não definir, uso esses como default e você edita depois.

## Fora deste primeiro escopo (fica para depois)

- Cobrança Stripe (adiciono num segundo passo — sinaliza quando quiser)
- Envio de mídia (áudio, imagem) — começamos só com texto, o mais seguro
- Simulação de "digitando…" e leitura — Evolution suporta, adiciono na fase 2
- Domínio próprio / white-label

## O que vou construir agora se você aprovar

Todo o backend (tabelas, RLS, server functions, cron), toda a UI cliente (`/app/*`) e admin, e a integração completa com Evolution API. A plataforma fica pronta para uso assim que você preencher os 2 secrets da Evolution.

Confirma que posso **remover o painel de leads** e seguir com esse plano?
