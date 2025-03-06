import { useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Document, Page, pdfjs } from "react-pdf";
import { ReactSortable } from "react-sortablejs";
import { _GSPS2PDF } from "./lib/worker-init.js";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

// A4 page size in points (portrait orientation)
const A4_WIDTH = 595;
const A4_HEIGHT = 842;

// Function to create a PDF from an image
async function createPdfFromImage(imageFile) {
  const arrayBuffer = await imageFile.arrayBuffer();
  const pdfDoc = await PDFDocument.create();

  // Embed the image (e.g., JPG or PNG)
  const imageBytes = new Uint8Array(arrayBuffer);
  let image;
  if (imageFile.type == "image/jpg") {
    image = await pdfDoc.embedJpg(imageBytes);
  }
  if (imageFile.type == "image/png") {
    image = await pdfDoc.embedPng(imageBytes);
  }

  const { width, height } = image.scale(1);

  const scale = Math.min(A4_WIDTH / width, A4_HEIGHT / height);

  const scaledWidth = width * scale;
  const scaledHeight = height * scale;

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);

  const xOffset = (A4_WIDTH - scaledWidth) / 2;
  const yOffset = (A4_HEIGHT - scaledHeight) / 2;

  // Draw the image on the page, scaling it to fit within A4 size
  page.drawImage(image, {
    x: xOffset,
    y: yOffset,
    width: scaledWidth,
    height: scaledHeight,
  });

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

function loadPDFData(response, filename) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", response);
    xhr.responseType = "arraybuffer";
    xhr.onload = function () {
      window.URL.revokeObjectURL(response);
      const blob = new Blob([xhr.response], { type: "application/pdf" });
      const pdfURL = window.URL.createObjectURL(blob);
      const size = xhr.response.byteLength;
      resolve({ pdfURL, size });
    };
    xhr.send();
  });
}

function PDFMerger() {
  const [isLoading, setIsLoading] = useState(false);
  const [compressPdf, setCompressPdf] = useState(true);

  const [pdfFiles, setPdfFiles] = useState([]);

  // Handle file selection
  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    const pdfObjects = [...pdfFiles];

    for (const file of files) {
      const fileType = file.type;
      const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);

      if (fileType.startsWith("image/")) {
        // If it's an image (e.g., JPG, PNG), create a PDF from it
        const pdf = await createPdfFromImage(file);
        pdfObjects.push({
          id: pdfObjects.length,
          name: file.name,
          file: pdf,
          url: URL.createObjectURL(pdf),
          sizeInMB: sizeInMB,
        });
      } else if (fileType === "application/pdf") {
        // If it's a PDF, handle it normally
        pdfObjects.push({
          id: pdfObjects.length,
          name: file.name,
          file,
          url: URL.createObjectURL(file),
          sizeInMB: sizeInMB,
        });
      }
    }

    setPdfFiles([...pdfObjects]);
  };

  // Merge PDFs
  const mergePDFs = async () => {
    setIsLoading(true);
    try {
      const mergedPdf = await PDFDocument.create();
      for (const { file } of pdfFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);

        // Iterate through pages
        for (const pageIndex of pdfDoc.getPageIndices()) {
          const copiedPages = await mergedPdf.copyPages(pdfDoc, [pageIndex]);
          copiedPages.forEach((copiedPage) => mergedPdf.addPage(copiedPage));
        }
      }

      const mergedPdfBytes = await mergedPdf.save();
      const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
      const dataObject = { psDataURL: URL.createObjectURL(blob) };
      let finalPdfUrl = dataObject.psDataURL;
      if (compressPdf) {
        const element = await _GSPS2PDF(dataObject);
        const { pdfURL, size: newSize } = await loadPDFData(
          element,
          "merged.min.pdf"
        );
        finalPdfUrl = pdfURL;
      }
      //
      const link = document.createElement("a");
      link.href = finalPdfUrl;
      link.download = "merged.pdf";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = (id) => {
    setPdfFiles(pdfFiles.filter((file) => file.id !== id));
  };

  return (
    <div>
      <div>
        <h2>1. Browse or Drag'n'drop multiple files (pdf, png, jpeg)</h2>
        <input
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          onChange={handleFileChange}
        />
        <h2>
          2. Preview, reorder the documents by drag and dropping, or remove
        </h2>
        <ReactSortable list={pdfFiles} setList={setPdfFiles}>
          {pdfFiles.map(({ id, url, name, sizeInMB }, index) => (
            <div
              key={id}
              id={id.toString()}
              style={{
                maxWidth: "300px",
                maxHeight: "500px",
                border: "1px solid black",
                margin: "5px",
                padding: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>{name} </div>
                <button onClick={() => handleRemove(id)}>X</button>
              </div>
              <code>{sizeInMB}Mb</code>
              <Document file={url}>
                <Page size="A4" pageNumber={1} height={300} />
              </Document>
            </div>
          ))}
        </ReactSortable>
        <h2>3. Finally get a merged document</h2>
        {pdfFiles.length > 0 && (
          <div>
            <button onClick={mergePDFs} disabled={isLoading}>
              Merge PDFs
            </button>

            <label>
              <input
                type="checkbox"
                checked={compressPdf}
                onChange={() => setCompressPdf(!compressPdf)}
              />
              <span>Compress</span>
            </label>
            <br></br>
            {isLoading &&
              "Might take a while is you don't have yet downloaded the wasm resource"}
          </div>
        )}
      </div>
      <br></br>
      <br></br>
      <br></br>
      <br></br>
      <footer class="footer">
        <p>
          {" "}
          The compression is really impressive thanks to{" "} <br></br>
          <a target="_blank" href="https://github.com/ochachacha/ps-wasm">
            Ochachacha
          </a>{" "}
          who ported the GhostScript lib in{" "}
          <a target="_blank" href="https://webassembly.org/">
            Webassembly
          </a><br></br>
          and{" "}
          <a
            target="_blank"
            href="https://github.com/laurentmmeyer/ghostscript-pdf-compress.wasm"
          >
            laurentmmeyer
          </a>{" "}
          who assembled it for a single page app
        </p>
      </footer>
    </div>
  );
}

export default PDFMerger;
