

# Master Dictionary para `sanitizeOcrAccents`

## Alteração

### Arquivo: `supabase/functions/processar-autos/index.ts`

Substituir o objeto `dict` (linhas 614-642) pelo Master Dictionary expandido com ~120 termos organizados em 3 categorias:

```typescript
const dict: Record<string, string> = {
  // 1. Termos Médicos, Anatômicos e Clínicos
  'medico': 'médico', 'medica': 'médica', 'medicos': 'médicos',
  'clinico': 'clínico', 'clinica': 'clínica',
  'fisico': 'físico', 'fisica': 'física',
  'ortopedico': 'ortopédico', 'ortopedica': 'ortopédica',
  'neurologico': 'neurológico', 'neurologica': 'neurológica',
  'psiquiatrico': 'psiquiátrico', 'psiquiatrica': 'psiquiátrica',
  'cardiaco': 'cardíaco', 'cardiaca': 'cardíaca',
  'sindrome': 'síndrome', 'sindromes': 'síndromes',
  'diagnostico': 'diagnóstico', 'prognostico': 'prognóstico',
  'terapeutico': 'terapêutico',
  'anatomico': 'anatômico', 'fisiologico': 'fisiológico',
  'patologico': 'patológico', 'patologica': 'patológica',
  'cranio': 'crânio', 'encefalico': 'encefálico',
  'ciatica': 'ciática',
  'vertebra': 'vértebra', 'vertebras': 'vértebras',
  'toracico': 'torácico', 'torax': 'tórax',
  'femur': 'fêmur', 'tibia': 'tíbia', 'umero': 'úmero',
  'osseo': 'ósseo', 'ossea': 'óssea',
  'tendinea': 'tendínea',
  'musculo': 'músculo', 'musculos': 'músculos',
  'articulacao': 'articulação', 'articulacoes': 'articulações',
  'lesao': 'lesão', 'lesoes': 'lesões',
  'inflamacao': 'inflamação', 'infeccao': 'infecção',
  'cirurgico': 'cirúrgico', 'cirurgica': 'cirúrgica',
  'pos-operatorio': 'pós-operatório', 'pre-operatorio': 'pré-operatório',
  'cronico': 'crônico', 'cronica': 'crônica',
  'sistemico': 'sistêmico',
  'pressao': 'pressão', 'frequencia': 'frequência',
  'respiratoria': 'respiratória', 'cardiologica': 'cardiológica',
  'pulmao': 'pulmão', 'orgao': 'órgão', 'orgaos': 'órgãos',
  'arteria': 'artéria', 'estomago': 'estômago',
  'ortostatica': 'ortostática',

  // 2. Termos Periciais, Jurídicos e Ocupacionais
  'juizo': 'juízo', 'pericia': 'perícia',
  'acidentario': 'acidentário',
  'previdenciario': 'previdenciário', 'previdencia': 'previdência',
  'beneficio': 'benefício', 'honorarios': 'honorários',
  'audiencia': 'audiência',
  'acao': 'ação', 'acoes': 'ações',
  'peticao': 'petição', 'declaracao': 'declaração',
  'documentario': 'documentário',
  'juridico': 'jurídico',
  'criterio': 'critério', 'criterios': 'critérios',
  'evidencia': 'evidência', 'evidencias': 'evidências',
  'consequencia': 'consequência', 'consequencias': 'consequências',
  'ocorrencia': 'ocorrência',
  'auxilio': 'auxílio', 'estetico': 'estético', 'estetica': 'estética',
  'temporario': 'temporário', 'temporaria': 'temporária',
  'reabilitacao': 'reabilitação', 'readaptacao': 'readaptação',
  'indenizacao': 'indenização',
  'profissao': 'profissão', 'funcao': 'função', 'funcoes': 'funções',
  'veiculo': 'veículo', 'transito': 'trânsito',
  'salario': 'salário', 'remuneracao': 'remuneração',
  'pos-hospitalar': 'pós-hospitalar',

  // 3. Substantivos e Ações Comuns (-ção, -ções, -cia)
  'nao': 'não', 'sao': 'são',
  'analise': 'análise',
  'conclusao': 'conclusão', 'avaliacao': 'avaliação', 'avaliacoes': 'avaliações',
  'reducao': 'redução', 'limitacao': 'limitação', 'limitacoes': 'limitações',
  'evolucao': 'evolução', 'realizacao': 'realização',
  'restricao': 'restrição', 'restricoes': 'restrições',
  'exposicao': 'exposição', 'concessao': 'concessão',
  'condicao': 'condição', 'condicoes': 'condições',
  'alteracao': 'alteração', 'alteracoes': 'alterações',
  'comprovacao': 'comprovação',
  'medicacao': 'medicação', 'medicacoes': 'medicações',
  'prescricao': 'prescrição',
  'internacao': 'internação', 'recuperacao': 'recuperação',
  'observacao': 'observação', 'constatacao': 'constatação',
  'operacao': 'operação',
  'producao': 'produção', 'relacao': 'relação',
  'necessario': 'necessário', 'necessaria': 'necessária',
  'proprio': 'próprio', 'propria': 'própria',
  'maximo': 'máximo', 'minimo': 'mínimo', 'media': 'média',
  'periodo': 'período', 'historico': 'histórico',
  'prontuario': 'prontuário', 'calcados': 'calçados',
};
```

A lógica de regex com preservação de capitalização (linhas 644-653) e a aplicação nos campos `avaliacao_sequelas`, `historico` e `exame_clinico` permanecem inalteradas.

## Deploy

`processar-autos`

