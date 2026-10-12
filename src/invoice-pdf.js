import html2canvas from 'html2canvas';
import { PDFDocument } from 'pdf-lib';

function captureScale() {
  const narrow = Math.min(window.screen?.width || 1200, window.innerWidth || 1200) < 900;
  return narrow ? 1.2 : 1.5;
}

async function canvasToJpeg(canvas) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (file) => (file ? resolve(file) : reject(new Error('Could not build PDF image'))),
      'image/jpeg',
      0.92,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function elementToPdfFile(element, filename) {
  if (document.fonts?.status !== 'loaded' && document.fonts?.ready) await document.fonts.ready;
  const canvas = await html2canvas(element, {
    scale: captureScale(),
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    width: 794,
    windowWidth: 794,
    onclone(doc) {
      for (const id of ['sheet', 'pdfSheet']) {
        const sheet = doc.getElementById(id);
        if (!sheet) continue;
        sheet.style.transform = 'none';
        sheet.style.margin = '0';
      }
    },
  });
  if (!canvas.width || canvas.height < 20) throw new Error('Invoice preview was blank');

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(filename.replace(/\.pdf$/i, ''));
  pdfDoc.setAuthor('BoostByRajat');
  pdfDoc.setCreator('BoostByRajat Invoice Desk');

  const pageW = 595.28;
  const pageH = 841.89;
  const idealPx = Math.max(1, Math.floor((canvas.width * pageH) / pageW));

  for (let y = 0; y < canvas.height; ) {
    const remaining = canvas.height - y;
    const hPx = remaining <= idealPx + 12 ? remaining : idealPx;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = hPx;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, hPx, 0, 0, canvas.width, hPx);
    const image = await pdfDoc.embedJpg(await canvasToJpeg(slice));
    const page = pdfDoc.addPage([pageW, pageH]);
    const drawH = (hPx / canvas.width) * pageW;
    const fittedH = Math.min(pageH, drawH);
    page.drawImage(image, { x: 0, y: pageH - fittedH, width: pageW, height: fittedH });
    y += hPx;
  }

  const bytes = await pdfDoc.save();
  return new File([bytes], filename, { type: 'application/pdf' });
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function phoneCanShareFiles() {
  const mobile = navigator.maxTouchPoints > 0 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  return mobile;
}

export async function sharePdfFile(file, { title, text } = {}) {
  if (phoneCanShareFiles() && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title || file.name,
        text: text || '',
      });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancel';
    }
  }
  downloadFile(file);
  return 'download';
}

export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}
