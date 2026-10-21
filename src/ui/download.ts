/** 端末へ保存。iOSでは共有シートが使えれば優先し、無ければダウンロード。成功したらtrue */
export async function saveFile(name: string, text: string, mime: string): Promise<boolean> {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], name, { type: mime });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
