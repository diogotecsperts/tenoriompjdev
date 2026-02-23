

# Expansão do Dicionário de Acentuação (`sanitizeOcrAccents`)

## Alteração

### Arquivo: `supabase/functions/processar-autos/index.ts`

Expandir o objeto `dict` na função `sanitizeOcrAccents` (linhas 614-630) adicionando os novos pares ao dicionário existente:

```typescript
const dict: Record<string, string> = {
  // Existentes
  'lesao': 'lesão', 'lesoes': 'lesões',
  'reducao': 'redução', 'funcao': 'função',
  'avaliacao': 'avaliação', 'conclusao': 'conclusão',
  'nao': 'não', 'sao': 'são',
  'medico': 'médico', 'medica': 'médica',
  'fisica': 'física', 'clinica': 'clínica',
  'periodo': 'período', 'pos-hospitalar': 'pós-hospitalar',
  'peticao': 'petição', 'acao': 'ação',
  'profissao': 'profissão', 'funcoes': 'funções',
  'orgao': 'órgão', 'orgaos': 'órgãos',
  'infeccao': 'infecção', 'operacao': 'operação',
  'reabilitacao': 'reabilitação', 'limitacao': 'limitação',
  'estetico': 'estético', 'estetica': 'estética',
  'auxilio': 'auxílio', 'necessario': 'necessário',
  'temporaria': 'temporária',
  // Novos
  'pressao': 'pressão', 'internacao': 'internação', 'recuperacao': 'recuperação',
  'evolucao': 'evolução', 'realizacao': 'realização', 'restricao': 'restrição',
  'exposicao': 'exposição', 'concessao': 'concessão', 'condicao': 'condição',
  'condicoes': 'condições', 'alteracao': 'alteração', 'alteracoes': 'alterações',
  'comprovacao': 'comprovação', 'medicacao': 'medicação', 'medicacoes': 'medicações',
  'prescricao': 'prescrição', 'respiratoria': 'respiratória',
  'ortostatica': 'ortostática', 'clinico': 'clínico', 'diagnostico': 'diagnóstico',
  'historico': 'histórico', 'prontuario': 'prontuário', 'calcados': 'calçados',
  'producao': 'produção', 'relacao': 'relação', 'sindrome': 'síndrome',
  'neurologico': 'neurológico', 'neurologica': 'neurológica',
  'ortopedico': 'ortopédico', 'ortopedica': 'ortopédica',
  'psiquiatrico': 'psiquiátrico', 'psiquiatrica': 'psiquiátrica',
};
```

Nenhuma outra alteração. A lógica de regex e aplicação nos campos permanece idêntica.

## Deploy

`processar-autos`
