# ERP Integral 4.0 — Supabase

Esta versão usa o Supabase como fonte oficial de dados. O LocalStorage é utilizado apenas como cache temporário de interface e não substitui o banco.

## Executar a validação

```bash
npm run build
```

Resultado esperado:

```text
ERP Integral validado. Pasta de saída: public
```

## Publicar no Vercel

- Framework Preset: `Other`
- Build Command: `npm run build`
- Output Directory: `public`

## Supabase configurado

A configuração pública está em `public/supabase-config.js`.

- Autenticação: Supabase Auth
- Banco: Postgres + RLS
- Documentos: bucket privado `documentos`

Nunca inclua `service_role`, secret key ou senha do banco no projeto.

## Dados gravados no Supabase

- perfis
- clientes
- projetos
- etapas de projetos
- pagamentos e recebimentos
- planos de trabalho
- etapas dos planos
- responsáveis
- entregáveis
- documentos
