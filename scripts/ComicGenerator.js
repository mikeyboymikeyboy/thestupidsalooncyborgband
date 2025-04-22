
// ComicGenerator.js - Handles comic generation functionality
import { PDFDocument } from 'pdf-lib';

class ComicGenerator {
    constructor() {
        this.canvas = document.getElementById('comicCanvas');
        this.svgWrapper = document.getElementById('comicSvgWrapper');
        this.pageWidthPts = 495;   // 6.875 inches * 72
        this.pageHeightPts = 752;  // 10.438 inches * 72
        this.maxPanels = 5;        // adjustable max number of panels
    }

    async downloadComic(visitedImages, visitedTexts, storyData) {
        console.log("Generating comic with images:", visitedImages);

        try {
            const journeyImages = visitedImages.slice(0, this.maxPanels);
            const journeyTexts = visitedTexts.slice(0, this.maxPanels);

            if (journeyImages.length === 0) {
                alert("No images available from your journey. Try playing through the story first!");
                return;
            }

            const blobUrls = await Promise.all(journeyImages.map(this.loadImageAsBlob));
            const svg = this.svgWrapper.querySelector("svg");

            if (!svg) {
                alert("Comic template SVG not found!");
                return;
            }

            const panels = Array.from(svg.querySelectorAll("image"));
            panels.forEach(panel => panel.removeAttribute("href"));

            const panelOrder = [0, 1, 3, 2, 4];
            panelOrder.forEach((journeyIndex, panelIndex) => {
                if (blobUrls[journeyIndex]) {
                    panels[panelIndex].setAttribute("href", blobUrls[journeyIndex]);
                }

                // Text not embedded yet – placeholder for future caption system
            });

            // Match canvas to PDF size
            this.canvas.width = 2048;
            this.canvas.height = 2860;
            const ctx = this.canvas.getContext("2d");
            console.log("Canvas dimensions before rendering:", this.canvas.width, this.canvas.height);
ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const v = await canvg.Canvg.fromString(ctx, svg.outerHTML);
            await v.render();

            const imgData = this.canvas.toDataURL("image/png");
console.log("PNG data URI length:", imgData.length);
            const pdfDoc = await PDFDocument.create();
            const img = await pdfDoc.embedPng(imgData);
console.log("Embedded image dimensions:", img.width, img.height);

            const scale = Math.max(this.pageWidthPts / img.width, this.pageHeightPts / img.height);
            const imgWidth = img.width * scale;
            const imgHeight = img.height * scale;
console.log("PDF scale factor:", scale);
console.log("Final image size on page:", imgWidth, imgHeight);
console.log("PDF page size:", this.pageWidthPts, this.pageHeightPts);
            const x = (this.pageWidthPts - imgWidth) / 2;
            const y = (this.pageHeightPts - imgHeight) / 2;

            const page = pdfDoc.addPage([this.pageWidthPts, this.pageHeightPts]);
            page.drawImage(img, { x, y, width: imgWidth, height: imgHeight });

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "your-adventure-comic.pdf";
            link.click();

            URL.revokeObjectURL(link.href);
            blobUrls.forEach(url => URL.revokeObjectURL(url));
            console.log("Comic generated and downloaded successfully!");

        } catch (error) {
            console.error("Error generating comic:", error);
            alert("Sorry, there was an error generating your comic. Please try again.");
        }
    }

    async loadImageAsBlob(url) {
        if (!url) return null;
        try {
            const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error("Error loading image:", error);
            return null;
        }
    }
}

export default ComicGenerator;
