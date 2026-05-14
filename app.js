/* ============================================================
   Officina PDF — Tutta la logica dei tool
   ============================================================ */

const { PDFDocument, degrees } = PDFLib;

/* -------- Utility -------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const fmtSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const setStatus = (el, msg, kind = '') => {
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
};

const download = (data, filename, mime = 'application/pdf') => {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const readAsArrayBuffer = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(file);
});

/* -------- Dropzone setup -------- */
function setupDropzone(zone) {
  const targetId = zone.dataset.target;
  const input = document.getElementById(targetId);

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag');
    input.files = e.dataTransfer.files;
    input.dispatchEvent(new Event('change'));
  });
}
$$('.dropzone').forEach(setupDropzone);

/* -------- Renderable file list with drag-to-reorder -------- */
class FileList {
  constructor(listEl, onChange) {
    this.el = listEl;
    this.files = [];
    this.onChange = onChange;
  }
  add(newFiles) {
    for (const f of newFiles) this.files.push(f);
    this.render();
    this.onChange?.();
  }
  set(newFiles) {
    this.files = Array.from(newFiles);
    this.render();
    this.onChange?.();
  }
  remove(idx) {
    this.files.splice(idx, 1);
    this.render();
    this.onChange?.();
  }
  clear() {
    this.files = [];
    this.render();
    this.onChange?.();
  }
  render() {
    this.el.innerHTML = '';
    this.files.forEach((f, i) => {
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.idx = i;
      li.innerHTML = `
        <span class="filename" title="${f.name}">${f.name}</span>
        <span class="filesize">${fmtSize(f.size)}</span>
        <button class="remove" aria-label="Rimuovi">×</button>
      `;
      li.querySelector('.remove').addEventListener('click', (e) => {
        e.stopPropagation();
        this.remove(i);
      });
      // drag to reorder
      li.addEventListener('dragstart', (e) => {
        li.classList.add('dragging');
        e.dataTransfer.setData('text/plain', i);
      });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = i;
        if (from === to) return;
        const [moved] = this.files.splice(from, 1);
        this.files.splice(to, 0, moved);
        this.render();
        this.onChange?.();
      });
      this.el.appendChild(li);
    });
  }
}

/* ============================================================
   01 — UNISCI PDF
   ============================================================ */
(function setupMerge() {
  const input = $('#merge-input');
  const runBtn = $('#merge-run');
  const status = $('#merge-status');
  const list = new FileList($('#merge-list'), () => {
    runBtn.disabled = list.files.length < 2;
  });

  input.addEventListener('change', () => {
    list.add(input.files);
    input.value = '';
  });

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    setStatus(status, 'Unione in corso…');
    try {
      const merged = await PDFDocument.create();
      for (const file of list.files) {
        const bytes = await readAsArrayBuffer(file);
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
      }
      const out = await merged.save();
      download(out, 'pdf-unito.pdf');
      setStatus(status, `Fatto — ${list.files.length} file uniti.`, 'ok');
    } catch (err) {
      console.error(err);
      setStatus(status, 'Errore: ' + err.message, 'err');
    } finally {
      runBtn.disabled = list.files.length < 2;
    }
  });
})();

/* ============================================================
   02 — DIVIDI PDF
   ============================================================ */
(function setupSplit() {
  const input = $('#split-input');
  const runBtn = $('#split-run');
  const range = $('#split-range');
  const status = $('#split-status');
  const list = new FileList($('#split-list'), () => {
    runBtn.disabled = list.files.length !== 1;
  });

  input.addEventListener('change', () => {
    list.set([input.files[0]]);
    input.value = '';
  });

  // Parse "1-3, 5, 8-10" into array of zero-indexed pages
  function parseRange(str, total) {
    const result = new Set();
    const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw new Error(`Sintassi non valida: "${part}"`);
      const start = parseInt(m[1]);
      const end = m[2] ? parseInt(m[2]) : start;
      if (start < 1 || end > total || start > end) {
        throw new Error(`Intervallo fuori limite: ${part} (pagine 1-${total})`);
      }
      for (let i = start; i <= end; i++) result.add(i - 1);
    }
    return [...result].sort((a, b) => a - b);
  }

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    setStatus(status, 'Estrazione in corso…');
    try {
      if (!range.value.trim()) throw new Error('Specifica le pagine da estrarre.');
      const bytes = await readAsArrayBuffer(list.files[0]);
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const total = src.getPageCount();
      const indices = parseRange(range.value, total);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, indices);
      pages.forEach((p) => out.addPage(p));
      const data = await out.save();
      const base = list.files[0].name.replace(/\.pdf$/i, '');
      download(data, `${base}-estratto.pdf`);
      setStatus(status, `Fatto — ${indices.length} pagine estratte.`, 'ok');
    } catch (err) {
      console.error(err);
      setStatus(status, 'Errore: ' + err.message, 'err');
    } finally {
      runBtn.disabled = list.files.length !== 1;
    }
  });
})();

/* ============================================================
   03 — RUOTA E RIORDINA
   ============================================================ */
(function setupRotate() {
  const input = $('#rotate-input');
  const runBtn = $('#rotate-run');
  const allLeft = $('#rotate-all-left');
  const allRight = $('#rotate-all-right');
  const grid = $('#rotate-pages');
  const status = $('#rotate-status');

  let currentFile = null;
  let rotations = []; // degrees per page (0/90/180/270)

  function setBtns(state) {
    runBtn.disabled = state;
    allLeft.disabled = state;
    allRight.disabled = state;
  }
  setBtns(true);

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    currentFile = file;
    input.value = '';
    grid.innerHTML = '';
    setStatus(status, 'Generazione anteprime…');
    try {
      const bytes = await readAsArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      rotations = new Array(pdf.numPages).fill(0);

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const thumb = document.createElement('div');
        thumb.className = 'page-thumb';
        thumb.dataset.page = i - 1;
        thumb.appendChild(canvas);
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = i;
        thumb.appendChild(num);

        thumb.addEventListener('click', () => {
          const idx = parseInt(thumb.dataset.page);
          rotations[idx] = (rotations[idx] + 90) % 360;
          canvas.style.transform = `rotate(${rotations[idx]}deg)`;
        });
        grid.appendChild(thumb);
      }
      setStatus(status, `Pronto — ${pdf.numPages} pagine. Clicca per ruotare.`, 'ok');
      setBtns(false);
    } catch (err) {
      console.error(err);
      setStatus(status, 'Errore: ' + err.message, 'err');
      setBtns(true);
    }
  });

  function applyAll(delta) {
    const canvases = grid.querySelectorAll('canvas');
    rotations = rotations.map((r, i) => {
      const v = (r + delta + 360) % 360;
      canvases[i].style.transform = `rotate(${v}deg)`;
      return v;
    });
  }
  allLeft.addEventListener('click', () => applyAll(-90));
  allRight.addEventListener('click', () => applyAll(90));

  runBtn.addEventListener('click', async () => {
    setBtns(true);
    setStatus(status, 'Salvataggio…');
    try {
      const bytes = await readAsArrayBuffer(currentFile);
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      doc.getPages().forEach((p, i) => {
        const current = p.getRotation().angle || 0;
        p.setRotation(degrees((current + rotations[i]) % 360));
      });
      const out = await doc.save();
      const base = currentFile.name.replace(/\.pdf$/i, '');
      download(out, `${base}-ruotato.pdf`);
      setStatus(status, 'Fatto.', 'ok');
    } catch (err) {
      console.error(err);
      setStatus(status, 'Errore: ' + err.message, 'err');
    } finally {
      setBtns(false);
    }
  });
})();

/* ============================================================
   04 — COMPRIMI PDF
   Ricomprime le immagini del PDF in JPEG al livello di qualità scelto.
   ============================================================ */
(function setupCompress() {
  const input = $('#compress-input');
  const runBtn = $('#compress-run');
  const quality = $('#compress-quality');
  const qLabel = $('#compress-quality-label');
  const status = $('#compress-status');
  const list = new FileList($('#compress-list'), () => {
    runBtn.disabled = list.files.length !== 1;
  });

  function qualityLabel(v) {
    if (v < 40) return `bassa (${v}%)`;
    if (v < 70) return `media (${v}%)`;
    return `alta (${v}%)`;
  }
  quality.addEventListener('input', () => {
    qLabel.textContent = qualityLabel(quality.value);
  });

  input.addEventListener('change', () => {
    list.set([input.files[0]]);
    input.value = '';
  });

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    setStatus(status, 'Rendering pagine…');
    try {
      const file = list.files[0];
      const originalSize = file.size;
      const bytes = await readAsArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const q = parseInt(quality.value) / 100;

      const out = await PDFDocument.create();
      // Scale factor influisce sulla risoluzione finale. Per compressione
      // bilanciamo: qualità bassa => meno DPI.
      const scale = q < 0.4 ? 1.2 : q < 0.7 ? 1.6 : 2.0;

      for (let i = 1; i <= pdf.numPages; i++) {
        setStatus(status, `Compressione pagina ${i} di ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const jpegBlob = await new Promise((res) =>
          canvas.toBlob(res, 'image/jpeg', q)
        );
        const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
        const img = await out.embedJpg(jpegBytes);

        // Mantieni le dimensioni in punti della pagina originale
        const origViewport = page.getViewport({ scale: 1 });
        const newPage = out.addPage([origViewport.width, origViewport.height]);
        newPage.drawImage(img, {
          x: 0, y: 0,
          width: origViewport.width,
          height: origViewport.height,
        });
      }

      const data = await out.save();
      const base = file.name.replace(/\.pdf$/i, '');
      download(data, `${base}-compresso.pdf`);
      const newSize = data.byteLength;
      const ratio = ((1 - newSize / originalSize) * 100).toFixed(1);
      setStatus(
        status,
        `${fmtSize(originalSize)} → ${fmtSize(newSize)} (${ratio > 0 ? '−' : '+'}${Math.abs(ratio)}%)`,
        'ok'
      );
    } catch (err) {
      console.error(err);
      setStatus(status, 'Errore: ' + err.message, 'err');
    } finally {
      runBtn.disabled = list.files.length !== 1;
    }
  });
})();

/* ============================================================
   05 — PDF → IMMAGINI (ZIP)
   ============================================================ */
(function setupToImages() {
  const input = $('#img-input');
  const runBtn = $('#img-run');
  const scale = $('#img-scale');
  const sLabel = $('#img-scale-label');
  const status = $('#img-status');
  const list = new FileList($('#img-list'), () => {
    runBtn.disabled = list.files.length !== 1;
  });

  function scaleLabel(v) {
    const n = parseFloat(v);
    if (n <= 1) return '1× (standard)';
    if (n <= 1.5) return '1.5× (buona)';
    if (n <= 2) return '2× (alta)';
    if (n <= 2.5) return '2.5× (molto alta)';
    return '3× (massima)';
  }
  scale.addEventListener('input', () => {
    sLabel.textContent = scaleLabel(scale.value);
  });

  input.addEventListener('change', () => {
    list.set([input.files[0]]);
    input.value = '';
  });

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    try {
      const file = list.files[0];
      const bytes = await readAsArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const s = parseFloat(scale.value);
      const base = file.name.replace(/\.pdf$/i, '');

      // Se è una sola pagina, scarica direttamente il PNG.
      // Altrimenti scarica un PNG per pagina (uno alla volta).
      for (let i = 1; i <= pdf.numPages; i++) {
        setStatus(status, `Rendering pagina ${i} di ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: s });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
        const suffix = pdf.numPages > 1
          ? `-p${String(i).padStart(String(pdf.numPages).length, '0')}`
          : '';
        download(blob, `${base}${suffix}.png`, 'image/png');
        // piccola pausa per non scatenare il blocco multi-download del browser
        if (pdf.numPages > 1) await new Promise((r) => setTimeout(r, 300));
      }
      setStatus(status, `Fatto — ${pdf.numPages} immagini scaricate.`, 'ok');
    } catch (err) {
      console.error(err);
      setStatus(status, 'Errore: ' + err.message, 'err');
    } finally {
      runBtn.disabled = list.files.length !== 1;
    }
  });
})();

/* ============================================================
   06 — P7M → PDF
   I file P7M sono buste PKCS#7/CMS. Possono essere DER o PEM/Base64.
   Strategia:
   1) Prova a interpretare i byte come DER (caso più comune)
   2) Se fallisce, prova come Base64 (alcuni .p7m sono "wrapped")
   3) Usa node-forge per parsare la struttura CMS ed estrarre il contenuto
   4) Verifica che il contenuto estratto inizi con %PDF-
   ============================================================ */
(function setupP7m() {
  const input = $('#p7m-input');
  const runBtn = $('#p7m-run');
  const status = $('#p7m-status');
  const list = new FileList($('#p7m-list'), () => {
    runBtn.disabled = list.files.length === 0;
  });

  input.addEventListener('change', () => {
    list.add(input.files);
    input.value = '';
  });

  function arrayBufferToBinaryString(buf) {
    const view = new Uint8Array(buf);
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < view.length; i += chunk) {
      s += String.fromCharCode.apply(null, view.subarray(i, i + chunk));
    }
    return s;
  }

  function extractPdfFromP7m(buffer) {
    let binary = arrayBufferToBinaryString(buffer);

    // Caso PEM: rimuovi header/footer e decodifica base64
    if (binary.includes('-----BEGIN')) {
      const match = binary.match(/-----BEGIN[^-]+-----([\s\S]*?)-----END/);
      if (match) {
        const b64 = match[1].replace(/\s+/g, '');
        binary = forge.util.decode64(b64);
      }
    } else {
      // Heuristica: se non sembra DER (primo byte non è 0x30), prova base64
      if (binary.charCodeAt(0) !== 0x30) {
        try {
          const cleaned = binary.replace(/\s+/g, '');
          // valida che sia base64-like
          if (/^[A-Za-z0-9+/=]+$/.test(cleaned)) {
            binary = forge.util.decode64(cleaned);
          }
        } catch (e) { /* prosegui con DER */ }
      }
    }

    // Parse ASN.1
    const asn1 = forge.asn1.fromDer(binary, { strict: false });
    const message = forge.pkcs7.messageFromAsn1(asn1);

    if (!message.rawCapture || !message.rawCapture.content) {
      throw new Error('Il file non contiene dati incorporati (busta detached).');
    }

    // forge espone il contenuto in rawCapture.content come ASN.1
    // Il contenuto effettivo è dentro un OCTET STRING (eventualmente
    // suddiviso in più frammenti)
    function collectOctets(node) {
      let acc = '';
      if (!node) return acc;
      if (typeof node.value === 'string') {
        acc += node.value;
      } else if (Array.isArray(node.value)) {
        for (const child of node.value) acc += collectOctets(child);
      }
      return acc;
    }

    let bytes = collectOctets(message.rawCapture.content);

    if (!bytes) throw new Error('Contenuto vuoto.');

    // Verifica magic bytes PDF
    if (!bytes.startsWith('%PDF-')) {
      // Alcuni P7M nidificano un altro P7M (doppia firma).
      // Tenta una seconda passata.
      if (bytes.charCodeAt(0) === 0x30) {
        try {
          const inner = forge.asn1.fromDer(bytes, { strict: false });
          const innerMsg = forge.pkcs7.messageFromAsn1(inner);
          const innerBytes = collectOctets(innerMsg.rawCapture.content);
          if (innerBytes.startsWith('%PDF-')) bytes = innerBytes;
        } catch (e) { /* lascia errore sotto */ }
      }
      if (!bytes.startsWith('%PDF-')) {
        throw new Error('Il contenuto estratto non è un PDF valido. Prova con openssl (vedi nota sotto).');
      }
    }

    // Converti string binaria → Uint8Array
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i) & 0xff;
    return out;
  }

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    let success = 0;
    let failed = [];
    for (const file of list.files) {
      try {
        setStatus(status, `Elaborazione: ${file.name}…`);
        const buf = await readAsArrayBuffer(file);
        const pdfBytes = extractPdfFromP7m(buf);
        const outName = file.name.replace(/\.p7m$/i, '').replace(/\.pdf$/i, '') + '.pdf';
        download(pdfBytes, outName);
        success++;
        await new Promise((r) => setTimeout(r, 250));
      } catch (err) {
        console.error(file.name, err);
        failed.push(`${file.name}: ${err.message}`);
      }
    }

    if (failed.length === 0) {
      setStatus(status, `Fatto — ${success} file estratti.`, 'ok');
    } else if (success > 0) {
      setStatus(status, `${success} ok, ${failed.length} falliti. Dettagli in console.`, 'err');
    } else {
      setStatus(status, `Estrazione fallita: ${failed[0]}`, 'err');
    }
    runBtn.disabled = list.files.length === 0;
  });
})();
