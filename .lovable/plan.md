

# Correção: Sanitização do Nome de Arquivo no Upload

## Problema Identificado

O erro `Invalid key` ocorre porque o nome do arquivo PDF contém caracteres especiais que o Supabase Storage não aceita:

- **Arquivo**: `Impugnação Vanildo Caboclo.pdf`
- **Caracteres problemáticos**: `ã` (acento), espaços

O Supabase Storage exige que as keys contenham apenas caracteres ASCII válidos.

## Solução

Adicionar uma função de sanitização que:
1. Remove acentos (normaliza para ASCII)
2. Substitui espaços por underscores
3. Remove caracteres especiais inválidos

## Alteração Necessária

**Arquivo**: `src/pages/Impugnacao.tsx`

**Mudança**: Adicionar função `sanitizeFileName` e usar no path de upload

**Antes (linha 201)**:
```typescript
const filePath = `${userId}/impugnacoes/${timestamp}-${file.name}`;
```

**Depois**:
```typescript
// Nova função auxiliar
const sanitizeFileName = (name: string): string => {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-zA-Z0-9._-]/g, "_"); // Substitui caracteres inválidos por _
};

// No upload
const safeFileName = sanitizeFileName(file.name);
const filePath = `${userId}/impugnacoes/${timestamp}-${safeFileName}`;
```

**Resultado**:
- `Impugnação Vanildo Caboclo.pdf` → `Impugnacao_Vanildo_Caboclo.pdf`

## Seção Técnica

### Função de Sanitização

```typescript
const sanitizeFileName = (name: string): string => {
  return name
    .normalize("NFD")                    // Decompõe acentos em base + diacrítico
    .replace(/[\u0300-\u036f]/g, "")     // Remove diacríticos (acentos)
    .replace(/[^a-zA-Z0-9._-]/g, "_");   // Substitui caracteres inválidos
};
```

### Caracteres Permitidos pelo Supabase Storage

- Letras: `a-z`, `A-Z`
- Números: `0-9`
- Especiais: `.`, `_`, `-`
- Barras: `/` (para estrutura de pastas)

### Impacto

- **Sistema de Laudos**: Nenhum (não será modificado)
- **Funcionalidade**: Arquivos com nomes especiais agora serão aceitos
- **Referência**: O nome original ainda é exibido nos toasts para o usuário

