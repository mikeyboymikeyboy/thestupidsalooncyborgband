// ComicGenerator.js - Handles comic generation functionality
class ComicGenerator {
    constructor() {
        this.canvas = document.getElementById('comicCanvas');
        this.svgWrapper = document.getElementById('comicSvgWrapper');
    }
    
    async downloadComic(visitedImages, visitedTexts, storyData) {
        console.log("Generating comic with images:", visitedImages);
        
        try {
            const journeyImages = visitedImages.slice(0, 5);
            const journeyTexts = visitedTexts.slice(0, 5);
            
            if (journeyImages.length === 0) {
                alert("No images available from your journey. Try playing through the story first!");
                return;
            }

            const blobUrls = await Promise.all(journeyImages.map(this.loadImageAsBlob));
            
            const svg = this.svgWrapper.querySelector("svg");
            const panels = Array.from(svg.querySelectorAll("image"));
            panels.forEach(panel => panel.removeAttribute("href"));
            
            const panelOrder = [0, 1, 3, 2, 4];
            panelOrder.forEach((journeyIndex, panelIndex) => {
                if (blobUrls[journeyIndex]) {
                    panels[panelIndex].setAttribute("href", blobUrls[journeyIndex]);
                }
                if (journeyTexts[journeyIndex]) {
                    const scene = storyData.find(s => s.text === journeyTexts[journeyIndex]);
                    let text = scene?.comicText || journeyTexts[journeyIndex].split('.')[0];
                    text = text.length > 50 ? text.substring(0, 47) + '...' : text;
                }
            });

            this.canvas.width = 2048;
            this.canvas.height = 2860;
            const ctx = this.canvas.getContext("2d");

            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const v = await canvg.Canvg.fromString(ctx, svg.outerHTML);
            await v.render();

            const imgData = this.canvas.toDataURL("image/png");

            const pdfDoc = await PDFLib.PDFDocument.create();
            const img = await pdfDoc.embedPng(imgData);
            const pageWidth = 495;
            const pageHeight = 752;
            const page = pdfDoc.addPage([pageWidth, pageHeight]);

            const scale = Math.min(pageWidth / img.width, pageHeight / img.height);
            const imgWidth = img.width * scale;
            const imgHeight = img.height * scale;
            const x = (pageWidth - imgWidth) / 2;
            const y = (pageHeight - imgHeight) / 2;

            page.drawImage(img, {
                x,
                y,
                width: imgWidth,
                height: imgHeight
            });

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: "application/pdf" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "your-adventure-comic.pdf";
            link.click();
            
            URL.revokeObjectURL(link.href);
            blobUrls.forEach(url => URL.revokeObjectURL(url));
            
            console.log("Comic generated and downloaded successfully!");
            return true;
        } catch (error) {
            console.error("Error generating comic:", error);
            alert("Sorry, there was an error generating your comic. Please try again.");
            return false;
        }
    }
    
    async loadImageAsBlob(url) {
        if (!url) return null;
        
        try {
            const response = await fetch(url, {
                mode: 'cors',
                credentials: 'omit'
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error('Error loading image:', error);
            return null;
        }
    }
}

export default ComicGenerator;