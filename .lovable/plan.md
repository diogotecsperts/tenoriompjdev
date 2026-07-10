# Validação dos alertas — Previdenciário confirmado como principal e 100% coberto

## Resumo por módulo

### Previdenciário (principal) — ✅ cobertura total
- **Login**: hook global `usePresenceHeartbeat` dispara `send-tracking-email` type `login` com nome, ID e email do usuário.
- **Erro de PDF**: `prev-pre-processar` captura qualquer falha (OCR Mistral ou geração) e envia com **userId, nome do periciado, nome da pauta e etapa** — é o mais completo dos três pontos de captura.
- **Resumo diário**: agrega `prev_pautas` (pautas criadas), `prev_pericias` (PDFs upados e processados) e `error_logs` (erros) por usuário, todos do dia em BRT.

### Trabalhista — ✅ funciona, com contexto reduzido
- **Login/Resumo diário**: idem (o resumo agrega `laudos` do dia).
- **Erro de PDF**: `processar-autos` chama o notify, mas hoje só passa `userId` e etapa. O email chega e é traduzido, mas os campos "Periciado / Pauta / Processo" ficam como "—".

### Ferramenta Impugnação — não é módulo, é a página `src/pages/Impugnacao.tsx`
- Usa `extrair-texto-pdf` para OCR. Erro é capturado, mas sem contexto de usuário/arquivo. Se preferir, dá para simplesmente remover esse ponto de captura (raro dar erro) e concentrar tudo nos dois módulos principais.

## Infra validada
- Cron `mpj-daily-summary-email` ativo (a cada 5 min, respeita janela BRT 23:30 e dedupe por dia).
- `email_tracking_config`: enabled, destinatário configurado, 3 flags ligadas.
- `email_tracking_log`: 3 testes recentes com status `sent`.
- RLS + GRANTs corretos.
- `translateError` classifica em 7 categorias em português (cota, chave inválida, rate limit, timeout, arquivo grande, parse, rede, inesperado).

## Correções propostas (opcionais)

1. **Trabalhista (`processar-autos`)** — enriquecer o payload de erro buscando `periciado_nome`, `processo_numero` e `pauta_nome` do job/laudo antes do notify. Assim o email de erro fica no mesmo nível do Previdenciário.
2. **Impugnação (`extrair-texto-pdf`)** — decidir entre (a) extrair `userId` do JWT e passar como contexto, ou (b) remover esse ponto de captura (já que não é um módulo principal).

Diga qual das duas linhas você prefere:
- **A**: aplicar as duas melhorias.
- **B**: aplicar só o Trabalhista e remover o alerta de erro da ferramenta Impugnação.
- **C**: deixar como está — os 3 alertas já estão funcionais.
