## Diagnóstico do erro

Analisei os network requests e identifiquei a causa exata:

1. ✅ `POST /functions/v1/dev-download-pdf` retorna **200 OK** com a URL assinada válida.
2. ❌ O `fetch(url)` subsequente para a Supabase Storage retorna **"Failed to fetch"**.

**Causa raiz:** O proxy de `window.fetch` do iframe de preview do Lovable intercepta e bloqueia a requisição GET cross-origin direta ao endpoint de storage do Supabase (`/storage/v1/object/sign/...`). Esse comportamento é **exclusivo do ambiente de preview** — não acontece no published URL nem no domínio customizado.

**Por que o download "segue normalmente":** Quando o `fetch` falha, o navegador acaba abrindo a URL assinada em outro fluxo (ou o usuário a vê funcionando em outras tentativas). Mas o toast de erro aparece porque o try/catch captura a falha do fetch.

### Por que estamos usando `fetch` + blob?

O código atual baixa o PDF via `fetch(url)` → `blob()` → `<a download>` para **forçar o nome correto do arquivo**. Se usássemos só `<a href={signedUrl} download>`, o navegador ignoraria o atributo `download` em URLs cross-origin, salvando o arquivo com nome aleatório.

## Correção proposta (cirúrgica e segura)

**Arquivo único alterado:** `src/components/dev-panel/DevOriginalFiles.tsx` (função `downloadFile`).

### Estratégia em duas camadas

**Camada 1 — Tentar fetch + blob (caminho ideal):**
- Mantém o comportamento atual que preserva o nome do arquivo.
- Funciona no published URL e domínio customizado.

**Camada 2 — Fallback automático (quando o proxy do preview bloqueia):**
- Se o `fetch(url)` lança erro (TypeError "Failed to fetch") OU se `resp.ok` é false, abre a URL assinada diretamente em uma nova aba (`window.open(url, "_blank")`).
- O navegador faz o download nativo. O nome do arquivo será o que está no path do storage (ex.: `1777235407397-Processo_0000629...pdf`), que já é descritivo.
- Mostra um toast informativo: *"Download iniciado em nova aba"* — sem variant destructive.

### Pseudo-código da mudança

```typescript
const downloadFile = async (filePath: string, fileName: string) => {
  setDownloadingPath(filePath);
  try {
    const { data, error } = await supabase.functions.invoke("dev-download-pdf", {
      body: { file_path: filePath },
    });
    if (error) throw error;
    const url = (data as any)?.url;
    if (!url) throw new Error("URL não retornada");

    // Tenta blob (preserva nome). Se falhar (proxy preview), abre direto.
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast({ title: "Download iniciado", description: fileName });
    } catch (fetchErr) {
      // Fallback: ambiente bloqueia fetch direto (preview iframe).
      // Abre a signed URL em nova aba — navegador baixa nativamente.
      window.open(url, "_blank", "noopener,noreferrer");
      toast({
        title: "Download iniciado",
        description: `${fileName} (aberto em nova aba)`,
      });
    }
  } catch (e: any) {
    toast({
      title: "Erro no download",
      description: e?.message ?? String(e),
      variant: "destructive",
    });
  } finally {
    setDownloadingPath(null);
  }
};
```

## Garantias de segurança e isolamento

- ✅ **Zero impacto em outras áreas.** Mudança isolada em uma única função do componente DevPanel.
- ✅ **Não toca em edge functions, banco, RLS, prompts ou pipeline de IA.**
- ✅ **Mantém a auditoria** — o log em `backend_logs` continua sendo escrito pela edge function `dev-download-pdf` (não muda nada no backend).
- ✅ **Mantém a segurança** — bucket continua privado, URL assinada continua expirando em 1h, `is_developer()` continua sendo verificado server-side.
- ✅ **Funciona em todos os ambientes** — preview (via fallback), published, custom domain (via blob).
- ✅ **UX preservada** — usuário recebe feedback positivo em vez de erro confuso.

## Resultado esperado

- No **preview do Lovable**: PDF abre em nova aba e o navegador baixa automaticamente. Toast verde: *"Download iniciado (aberto em nova aba)"*.
- No **published URL** (`tenoriompjdev.lovable.app`) e **domínio customizado**: continua baixando via blob com o nome exato do arquivo (`1777235407397-Processo_0000629...pdf`). Toast verde: *"Download iniciado"*.
- O toast vermelho **"Erro no download / Failed to fetch" desaparece** completamente.