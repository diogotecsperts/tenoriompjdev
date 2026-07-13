UPDATE public.prev_processing_jobs
SET status='failed',
    stage='failed',
    progress=100,
    error_code='provider_timeout',
    error_message='Worker de OCR encerrou sem responder (provável estouro de memória em PDF grande). Tente novamente — o pipeline agora usa streaming direto ao Gemini para arquivos grandes.',
    technical_detail='job zombie recovery: last update stuck at ocr_processing 18% for >7min',
    completed_at=now(),
    updated_at=now()
WHERE id='9994ae70-7209-455d-b606-99579043781c'
  AND status IN ('queued','processing');