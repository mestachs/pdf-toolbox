import { useState, useRef, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
import { Document, Page, pdfjs } from "react-pdf";
import { ReactSortable } from "react-sortablejs";
import { _GSPS2PDF } from "./lib/worker-init.js";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

let idCounter = 0;

async function createPdfFromImage(imageFile) {
  const arrayBuffer = await imageFile.arrayBuffer();
  const pdfDoc = await PDFDocument.create();
  const imageBytes = new Uint8Array(arrayBuffer);
  let image;
  if (imageFile.type === "image/jpeg" || imageFile.type === "image/jpg") {
    image = await pdfDoc.embedJpg(imageBytes);
  } else if (imageFile.type === "image/png") {
    image = await pdfDoc.embedPng(imageBytes);
  }
  const { width, height } = image.scale(1);
  const scale = Math.min(A4_WIDTH / width, A4_HEIGHT / height);
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  page.drawImage(image, {
    x: (A4_WIDTH - width * scale) / 2,
    y: (A4_HEIGHT - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  });
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

function loadPDFData(response) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", response);
    xhr.responseType = "arraybuffer";
    xhr.onload = function () {
      window.URL.revokeObjectURL(response);
      const blob = new Blob([xhr.response], { type: "application/pdf" });
      resolve({ pdfURL: window.URL.createObjectURL(blob), size: xhr.response.byteLength });
    };
    xhr.send();
  });
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

const SAVED_CONTEXTS = [
  { max: 1_000,         text: "six SMS texts to your mum" },
  { max: 10_000,        text: "a Nokia ringtone from 2003" },
  { max: 50_000,        text: "your entire Hotmail inbox, circa 2002" },
  { max: 200_000,       text: "a Wikipedia article about artisanal cheese" },
  { max: 700_000,       text: "the original Netscape Navigator installer" },
  { max: 1_500_000,     text: "a floppy disk stuffed with clipart" },
  { max: 4_000_000,     text: "a 3-minute MP3 of questionable taste" },
  { max: 8_000_000,     text: "a slightly blurry holiday JPEG" },
  { max: 15_000_000,    text: "the original Doom — yes, the whole game" },
  { max: 30_000_000,    text: "a Windows 3.11 for Workgroups install" },
  { max: 60_000_000,    text: "an hour of podcast nobody asked for" },
  { max: 700_000_000,   text: "a DivX rip burned onto a borrowed CD-R" },
  { max: 5_000_000_000, text: "a Lord of the Rings Extended Edition DVD" },
  { max: Infinity,      text: "several seasons of Game of Thrones" },
];

function savedContext(bytes) {
  const entry = SAVED_CONTEXTS.find(({ max }) => bytes < max);
  return entry ? `🌍 The planet thanks you — that's like ${entry.text} freed from a server.` : null;
}

function PDFMerger() {
  const [isLoading, setIsLoading] = useState(false);
  const [compressPdf, setCompressPdf] = useState(true);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [fileName, setFileName] = useState("merged");
  const [mergeResult, setMergeResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [previewFile, setPreviewFile] = useState(null);
  const [previewScale, setPreviewScale] = useState(1.0);
  const [numPages, setNumPages] = useState(null);

  const fileInputRef = useRef(null);
  const previewContentRef = useRef(null);

  // Ctrl+Wheel to zoom in the preview panel
  useEffect(() => {
    const el = previewContentRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setPreviewScale((s) => {
        const next = s + (e.deltaY < 0 ? 0.1 : -0.1);
        return Math.min(3, Math.max(0.25, parseFloat(next.toFixed(2))));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [previewFile]); // re-attach when panel mounts/unmounts

  const processFiles = async (files) => {
    const pdfObjects = [...pdfFiles];
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const pdf = await createPdfFromImage(file);
        const sizeInMB = (pdf.size / (1024 * 1024)).toFixed(2);
        pdfObjects.push({ id: idCounter++, name: file.name, file: pdf, url: URL.createObjectURL(pdf), sizeInMB, sizeBytes: pdf.size });
      } else if (file.type === "application/pdf") {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        pdfObjects.push({ id: idCounter++, name: file.name, file, url: URL.createObjectURL(file), sizeInMB, sizeBytes: file.size });
      }
    }
    setMergeResult(null);
    setPdfFiles([...pdfObjects]);
  };

  const handleFileChange = async (event) => {
    await processFiles(Array.from(event.target.files));
    event.target.value = "";
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); };
  const handleDrop = async (e) => { e.preventDefault(); setIsDragging(false); await processFiles(Array.from(e.dataTransfer.files)); };

  const handleCardClick = (file) => {
    if (previewFile?.id === file.id) {
      setPreviewFile(null);
      setNumPages(null);
    } else {
      setPreviewFile(file);
      setPreviewScale(1.0);
      setNumPages(null);
    }
  };

  const handleRemove = (e, id) => {
    e.stopPropagation();
    setPdfFiles((files) => files.filter((f) => f.id !== id));
    setMergeResult(null);
    if (previewFile?.id === id) { setPreviewFile(null); setNumPages(null); }
  };

  const zoomIn = () => setPreviewScale((s) => Math.min(3, parseFloat((s + 0.25).toFixed(2))));
  const zoomOut = () => setPreviewScale((s) => Math.max(0.25, parseFloat((s - 0.25).toFixed(2))));
  const zoomReset = () => setPreviewScale(1.0);
  const fitWidth = () => {
    const el = previewContentRef.current;
    if (!el) return;
    const available = el.clientWidth - 48;
    setPreviewScale(Math.max(0.25, Math.min(3, parseFloat((available / A4_WIDTH).toFixed(2)))));
  };

  const mergePDFs = async () => {
    setIsLoading(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const { file } of pdfFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        for (const pageIndex of pdfDoc.getPageIndices()) {
          const [copied] = await mergedPdf.copyPages(pdfDoc, [pageIndex]);
          mergedPdf.addPage(copied);
        }
      }
      const blob = new Blob([await mergedPdf.save()], { type: "application/pdf" });
      let finalUrl = URL.createObjectURL(blob);
      let finalSize = blob.size;
      if (compressPdf) {
        const element = await _GSPS2PDF({ psDataURL: finalUrl });
        ({ pdfURL: finalUrl, size: finalSize } = await loadPDFData(element));
      }
      const originalSize = pdfFiles.reduce((sum, f) => sum + f.sizeBytes, 0);
      setMergeResult({ finalSize, originalSize });
      const link = document.createElement("a");
      link.href = finalUrl;
      link.download = `${fileName.trim() || "merged"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-title">
          <svg className="app-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <line x1="9" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <h1>PDF Toolbox</h1>
        </div>
        <p className="app-subtitle">Merge, reorder, and compress PDF documents entirely in your browser</p>
      </header>

      <main className="main-content">
        <section className="step">
          <div className="step-header">
            <span className="step-number">1</span>
            <h2>Add files</h2>
          </div>
          <div
            className={`drop-zone${isDragging ? " dragging" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="drop-zone-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="drop-zone-text">Drop files here or click to browse</p>
            <p className="drop-zone-hint">PDF · PNG · JPEG</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </div>
        </section>

        {pdfFiles.length > 0 && (
          <>
            <section className="step">
              <div className="step-header">
                <span className="step-number">2</span>
                <h2>Arrange documents</h2>
                <span className="file-count">{pdfFiles.length} file{pdfFiles.length !== 1 ? "s" : ""}</span>
                <span className="total-size">{fmtSize(pdfFiles.reduce((s, f) => s + f.sizeBytes, 0))}</span>
              </div>
              <div className={`documents-layout${previewFile ? " has-preview" : ""}`}>
                <ReactSortable list={pdfFiles} setList={setPdfFiles} className="document-grid">
                  {pdfFiles.map((fileObj) => {
                    const { id, url, name, sizeInMB } = fileObj;
                    const selected = previewFile?.id === id;
                    return (
                      <div
                        key={id}
                        id={String(id)}
                        className={`document-card${selected ? " selected" : ""}`}
                        onClick={() => handleCardClick(fileObj)}
                        title="Click to preview"
                      >
                        <div className="document-card-header">
                          <div className="document-info">
                            <span className="document-name" title={name}>{name}</span>
                            <span className="document-size">{sizeInMB} MB</span>
                          </div>
                          <button
                            className="remove-btn"
                            onClick={(e) => handleRemove(e, id)}
                            title="Remove"
                          >✕</button>
                        </div>
                        <div className="document-preview">
                          <Document file={url}>
                            <Page size="A4" pageNumber={1} height={260} />
                          </Document>
                        </div>
                      </div>
                    );
                  })}
                </ReactSortable>

                {previewFile && (
                  <div className="preview-panel">
                    <div className="preview-toolbar">
                      <span className="preview-filename" title={previewFile.name}>
                        {previewFile.name}
                      </span>
                      {numPages != null && (
                        <span className="preview-page-count">{numPages}p</span>
                      )}
                      <div className="preview-zoom">
                        <button className="zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
                        <button className="zoom-pct" onClick={zoomReset} title="Reset zoom">
                          {Math.round(previewScale * 100)}%
                        </button>
                        <button className="zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
                        <button className="zoom-btn fit-btn" onClick={fitWidth} title="Fit width">⤢</button>
                      </div>
                      <button
                        className="preview-close"
                        onClick={() => { setPreviewFile(null); setNumPages(null); }}
                        title="Close preview"
                      >✕</button>
                    </div>
                    <div className="preview-hint">Ctrl+Scroll to zoom · scroll to navigate pages</div>
                    <div className="preview-content" ref={previewContentRef}>
                      <Document
                        file={previewFile.url}
                        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                      >
                        {numPages && Array.from({ length: numPages }, (_, i) => (
                          <div key={i} className="preview-page">
                            <Page pageNumber={i + 1} scale={previewScale} />
                          </div>
                        ))}
                      </Document>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="step">
              <div className="step-header">
                <span className="step-number">3</span>
                <h2>Export</h2>
              </div>
              <div className="export-panel">
                <label className="compress-toggle">
                  <input type="checkbox" checked={compressPdf} onChange={() => setCompressPdf(!compressPdf)} />
                  <span className="toggle-slider" />
                  <span className="toggle-label">Compress with GhostScript</span>
                </label>
                <div className="filename-input-wrap">
                  <input
                    className="filename-input"
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    placeholder="merged"
                    spellCheck={false}
                  />
                  <span className="filename-ext">.pdf</span>
                </div>
                <button className="merge-btn" onClick={mergePDFs} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <span className="spinner" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Merge & Download
                    </>
                  )}
                </button>
                {isLoading && (
                  <p className="loading-hint">
                    This may take a moment while the WebAssembly module loads for the first time.
                  </p>
                )}
                {mergeResult && !isLoading && (
                  <div className="merge-result">
                    <div className="merge-result-row">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>{fmtSize(mergeResult.finalSize)}</span>
                      {mergeResult.finalSize < mergeResult.originalSize && (
                        <span className="merge-saved">
                          −{fmtSize(mergeResult.originalSize - mergeResult.finalSize)} ({Math.round((1 - mergeResult.finalSize / mergeResult.originalSize) * 100)}% smaller)
                        </span>
                      )}
                    </div>
                    {mergeResult.finalSize < mergeResult.originalSize && (
                      <p className="merge-planet">
                        {savedContext(mergeResult.originalSize - mergeResult.finalSize)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="app-footer">
        <p>
          Compression powered by GhostScript via WebAssembly ·{" "}
          <a target="_blank" rel="noreferrer" href="https://github.com/ochachacha/ps-wasm">ochachacha</a>
          {" "}· firstly assembled by{" "}
          <a target="_blank" rel="noreferrer" href="https://github.com/laurentmmeyer/ghostscript-pdf-compress.wasm">laurentmmeyer</a>
          {" "}· improved by{" "}  <a target="_blank" rel="noreferrer" href="https://mestachs.github.io/">me</a>

        </p>
      </footer>
    </div>
  );
}

export default PDFMerger;
