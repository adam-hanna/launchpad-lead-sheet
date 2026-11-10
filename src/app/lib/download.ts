/** Offer text to the user as a file download (JSON / chart export). Browser only. */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Read a picked file as text. */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('could not read file'));
    };
    reader.readAsText(file);
  });
}

export function safeFilename(title: string, ext: string): string {
  const base =
    title
      .trim()
      .replace(/[^\w\- ]+/g, '')
      .replace(/\s+/g, '-') || 'sheet';
  return `${base}.${ext}`;
}
