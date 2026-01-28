/**
 * Google Gemini Files API
 * 
 * Para PDFs acima de 50MB, o Gemini requer upload prévio para a Files API
 * - Suporta arquivos até 2GB
 * - Armazenamento temporário gratuito por 48h no Google
 * - Referência: https://ai.google.dev/gemini-api/docs/vision?lang=rest#large-files
 */

const FILES_API_BASE = 'https://generativelanguage.googleapis.com';

export interface GeminiFileMetadata {
  name: string;
  displayName: string;
  mimeType: string;
  sizeBytes: string;
  createTime: string;
  updateTime: string;
  expirationTime: string;
  sha256Hash: string;
  uri: string;
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
}

/**
 * Upload a PDF to Gemini Files API
 * Returns the file URI to use in generateContent
 */
export async function uploadToGeminiFilesAPI(
  pdfBase64: string,
  apiKey: string
): Promise<string> {
  console.log('[gemini-files-api] Starting upload to Files API...');
  
  // Convert base64 to binary
  const binaryString = atob(pdfBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const pdfBuffer = bytes.buffer;
  
  const fileSizeMB = (pdfBuffer.byteLength / (1024 * 1024)).toFixed(2);
  console.log(`[gemini-files-api] PDF size: ${fileSizeMB}MB`);
  
  // Step 1: Initialize resumable upload
  const initResponse = await fetch(
    `${FILES_API_BASE}/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': pdfBuffer.byteLength.toString(),
        'X-Goog-Upload-Header-Content-Type': 'application/pdf',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: {
          displayName: `import_${Date.now()}.pdf`
        }
      })
    }
  );
  
  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`Files API init failed (${initResponse.status}): ${error}`);
  }
  
  // Get upload URL from header
  const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('Files API did not return upload URL');
  }
  
  console.log('[gemini-files-api] Got upload URL, uploading file...');
  
  // Step 2: Upload the actual file
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': pdfBuffer.byteLength.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: pdfBuffer
  });
  
  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Files API upload failed (${uploadResponse.status}): ${error}`);
  }
  
  const fileData = await uploadResponse.json();
  const fileMetadata = fileData.file as GeminiFileMetadata;
  
  console.log(`[gemini-files-api] Upload complete. File: ${fileMetadata.name}, State: ${fileMetadata.state}`);
  
  // Step 3: Wait for processing if needed
  if (fileMetadata.state === 'PROCESSING') {
    await waitForFileProcessing(fileMetadata.name, apiKey);
  }
  
  return fileMetadata.uri;
}

/**
 * Wait for a file to finish processing
 */
async function waitForFileProcessing(
  fileName: string,
  apiKey: string,
  maxWaitMs: number = 120000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds
  
  console.log(`[gemini-files-api] Waiting for file processing: ${fileName}`);
  
  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(
      `${FILES_API_BASE}/v1beta/${fileName}?key=${apiKey}`,
      { method: 'GET' }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Files API get status failed (${response.status}): ${error}`);
    }
    
    const data = await response.json();
    
    if (data.state === 'ACTIVE') {
      console.log('[gemini-files-api] File processing complete');
      return;
    }
    
    if (data.state === 'FAILED') {
      throw new Error(`File processing failed: ${data.error?.message || 'Unknown error'}`);
    }
    
    // Still processing, wait and retry
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`File processing timeout after ${maxWaitMs/1000}s`);
}

/**
 * Delete a file from Gemini Files API
 * Should be called after processing to free up storage
 */
export async function deleteGeminiFile(
  fileUri: string,
  apiKey: string
): Promise<void> {
  // Extract file name from URI (format: files/xxx)
  const match = fileUri.match(/files\/[a-z0-9]+/i);
  if (!match) {
    console.warn(`[gemini-files-api] Could not parse file name from URI: ${fileUri}`);
    return;
  }
  
  const fileName = match[0];
  
  const response = await fetch(
    `${FILES_API_BASE}/v1beta/${fileName}?key=${apiKey}`,
    { method: 'DELETE' }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.warn(`[gemini-files-api] Delete failed (${response.status}): ${error}`);
    // Don't throw - file will expire automatically
  } else {
    console.log(`[gemini-files-api] Deleted file: ${fileName}`);
  }
}

/**
 * List files in the Gemini Files API (for debugging)
 */
export async function listGeminiFiles(apiKey: string): Promise<GeminiFileMetadata[]> {
  const response = await fetch(
    `${FILES_API_BASE}/v1beta/files?key=${apiKey}`,
    { method: 'GET' }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Files API list failed (${response.status}): ${error}`);
  }
  
  const data = await response.json();
  return data.files || [];
}
