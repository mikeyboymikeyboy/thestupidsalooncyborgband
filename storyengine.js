// Story Engine - Main game functionality
const StoryEngine = (function() {
    // Private variables
    let storyData = [];
    let currentScene = null;
    let buffers = {};
    let currentSource = null;
    let choiceMade = null;
    let isLoopingScene = false;
    let visitedImages = [];
    let visitedAudio = [];
    let visitedTexts = [];
    let imageCache = new Map();
    let multiAudioSources = {};
    let multiAudioGains = {};
    let currentMultiAudio = null;
    let audioContext = null;
    let config = {
        storyPath: 'story.json',
        skin: 'western'
    };

    // Initialize the audio context
    function initAudioContext() {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100
        });
        return audioContext;
    }

    // Image loading and caching
    async function loadImageAsBlob(url) {
        if (!url) return null;
        if (imageCache.has(url)) {
            return imageCache.get(url);
        }

        try {
            const response = await fetch(url, {
                mode: 'cors',
                credentials: 'omit'
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = blobUrl;
            });
            
            imageCache.set(url, blobUrl);
            return blobUrl;
        } catch (error) {
            console.error('Error loading image:', error);
            return null;
        }
    }

    // Preload images
    async function preloadImages(imageUrls) {
        await Promise.all(imageUrls.filter(url => url).map(loadImageAsBlob));
    }

    // Audio loading
    async function loadAudio(url) {
        if (!url) return null;
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error('Error loading audio:', error);
            return null;
        }
    }

    // Audio playback
    function playAudio(name, loop, onEnded) {
        stopAudio();
        const buffer = buffers[name];
        if (!buffer) return;

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.loop = loop;
        
        if (onEnded) {
            source.onended = () => {
                document.querySelectorAll('.button.waiting').forEach(btn => {
                    btn.classList.remove('waiting');
                });
                onEnded();
            };
        }
        source.start(0);
        currentSource = source;
    }

    // Stop audio playback
    function stopAudio() {
        if (currentSource) {
            try {
                currentSource.stop();
            } catch (e) {
                // Ignore errors when stopping already stopped sources
            }
            currentSource.disconnect();
            currentSource = null;
            stopMultiAudio();
        }
    }

    // Multi-track audio playback
    async function playMultiAudio(multiAudioMap, onEnded) {
        stopAudio();
        stopMultiAudio();

        multiAudioSources = {};
        multiAudioGains = {};

        const labels = Object.keys(multiAudioMap || {});
        if (labels.length === 0) return;

        const promises = [];

        for (let label of labels) {
            const url = multiAudioMap[label];
            const promise = loadAudio(url).then(buffer => {
                if (!buffer) return;
                
                const source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.loop = true;

                const gainNode = audioContext.createGain();
                gainNode.gain.value = 0;

                source.connect(gainNode).connect(audioContext.destination);
                multiAudioSources[label] = source;
                multiAudioGains[label] = gainNode;
            });
            promises.push(promise);
        }

        await Promise.all(promises);

        Object.values(multiAudioSources).forEach(src => src.start(0));
        currentMultiAudio = true;
        const firstTrack = Object.keys(multiAudioSources)[0];
        if (firstTrack) {
            multiAudioGains[firstTrack].gain.value = 1;
        }

        if (onEnded) {
            Object.values(multiAudioSources).forEach(source => {
                source.onended = onEnded;
            });
        }
    }

    // Stop multi-track audio playback
    function stopMultiAudio() {
        for (let label in multiAudioSources) {
            try { 
                multiAudioSources[label].stop(); 
            } catch (e) {
                // Ignore errors when stopping already stopped sources
            }
            multiAudioSources[label].disconnect();
        }
        multiAudioSources = {};
        multiAudioGains = {};
        currentMultiAudio = null;
    }

    // Switch between multi-track audio
    function switchToTrack(label) {
        if (!multiAudioGains[label]) return;
        for (let l in multiAudioGains) {
            multiAudioGains[l].gain.value = l === label ? 1 : 0;
        }
    }

    // Display a scene
    async function showScene(sceneId) {
        const scene = storyData.find(s => s.id === sceneId);
        if (!scene) {
            console.error(`Scene not found: ${sceneId}`);
            document.getElementById("game").innerHTML = `
                <p>❌ Scene not found: ${sceneId}</p>
                <div class="button" onclick="window.StoryEngine.startScene()">Return to Start</div>
            `;
            return;
        }

        currentScene = scene;

        // Track visited content
        if (scene.image && !visitedImages.includes(scene.image)) {
            visitedImages.push(scene.image);
            await loadImageAsBlob(scene.image);
        }
        if (scene.audio && !visitedAudio.includes(scene.audio)) {
            visitedAudio.push(scene.audio);
        }
        if (scene.text && !visitedTexts.includes(scene.text)) {
            visitedTexts.push(scene.text);
        }

        let html = '';
        
        if (scene.image || scene.text) {
            const cleanText = scene.text ? scene.text.replace(/\[\[.*?\]\]/g, '') : '';
            const imageUrl = scene.image ? await loadImageAsBlob(scene.image) : '';
            
            html += `
                <div class="image-text-container">
                    ${imageUrl ? `<img src="${imageUrl}" alt="" class="fade-in" crossOrigin="anonymous" onload="this.classList.add('loaded')">` : ''}
                    <div class="text-block">
                        ${scene.scrollText === true
                            ? `<div class="scrolling-container">
                                <div class="slideshow-container left-fixed"><img id="slideshowImage1" class="slideshow-image" crossOrigin="anonymous" src=""></div>
                                <div class="slideshow-container right"><img id="slideshowImage2" class="slideshow-image" crossOrigin="anonymous" src=""></div>
                                <div class="scrolling-inner">${cleanText}</div>
                              </div>`
                            : cleanText}
                    </div>
                </div>
            `;
        }

        if (scene.choices && scene.choices.length > 0) {
            scene.choices.forEach(choice => {
                html += `<div class="button" onclick="window.StoryEngine.handleChoice('${choice.next}')">${choice.label}</div>`;
            });
        } else {
            html += `
                <div class="button comic-download" onclick="window.StoryEngine.downloadComic()">📄 Download Your Adventure Comic</div>
                <div class="button audio-download" onclick="window.StoryEngine.downloadAudioJourney()">🎵 Download Your Sonic Journey</div>
            `;
        }

        if (scene.multiAudio) {
            isLoopingScene = true;
            playMultiAudio(scene.multiAudio, () => {
                if (choiceMade) {
                    showScene(choiceMade);
                    choiceMade = null;
                }
            });
            const switcherButtons = Object.keys(scene.multiAudio).map(label =>
                `<button class='button' onclick="window.StoryEngine.switchToTrack('${label}')">Switch to ${label}</button>`
            ).join("");
            html += "<div style='margin-top:1em'>" + switcherButtons + "</div>";
        }

        document.getElementById("game").innerHTML = html;

        if (scene.scrollText === true) {
            setupScrollingText();
        }

        if (scene.audio) {
            isLoopingScene = scene.loopAudio;
            playAudio(scene.audio, scene.loopAudio, () => {
                if (choiceMade) {
                    showScene(choiceMade);
                    choiceMade = null;
                }
            });
        }
    }

    // Setup scrolling text with image slideshow
    function setupScrollingText() {
        const img1 = document.getElementById("slideshowImage1");
        const img2 = document.getElementById("slideshowImage2");
        if (visitedImages.length > 0 && img1 && img2) {
            const floatClasses = ['floatUp', 'floatDown', 'floatLeft', 'floatRight', 'floatDiagonalLeft', 'floatDiagonalRight'];
            function applyRandomFloatClass(img) {
                floatClasses.forEach(cls => img.classList.remove(cls));
                const randomClass = floatClasses[Math.floor(Math.random() * floatClasses.length)];
                img.classList.add(randomClass);
            }

            function randomizePosition(container) {
                const top = Math.floor(Math.random() * 70) + 10;
                container.style.top = top + '%';
            }

            let slideshowIndex = 0;
            setInterval(async () => {
                const imageUrl = visitedImages[slideshowIndex % visitedImages.length];
                const blobUrl = await loadImageAsBlob(imageUrl);
                const isEven = slideshowIndex % 2 === 0;
                if (isEven) {
                    img1.src = blobUrl;
                    applyRandomFloatClass(img1);
                    randomizePosition(img1.parentElement);
                    img1.classList.add("visible");
                    img2.classList.remove("visible");
                } else {
                    img2.src = blobUrl;
                    applyRandomFloatClass(img2);
                    randomizePosition(img2.parentElement);
                    img2.classList.add("visible");
                    img1.classList.remove("visible");
                }
                slideshowIndex++;
            }, 4000);
        }

        const container = document.querySelector('.scrolling-container');
        const inner = document.querySelector('.scrolling-inner');
        if (container && inner) {
            const distance = inner.scrollHeight + container.clientHeight;
            inner.style.transform = 'translateY(0px)';
            inner.style.transition = `transform ${distance / 50}s linear`;
            requestAnimationFrame(() => {
                inner.style.transform = `translateY(-${distance}px)`;
            });
        }
    }

    // Handle player choice selection
    function handleChoice(nextId) {
        const selectedChoice = currentScene.choices.find(c => c.next === nextId);
        if (!selectedChoice) {
            console.error(`Invalid choice: ${nextId}`);
            return;
        }

        if (isLoopingScene) {
            choiceMade = nextId;

            const buttons = document.querySelectorAll(".button");
            buttons.forEach(btn => {
                if (btn.textContent === selectedChoice.label) {
                    btn.classList.add("waiting");
                }
            });

            if (currentSource) {
                currentSource.loop = false;
                return;
            }

            if (currentMultiAudio) {
                stopMultiAudio();
                showScene(choiceMade);
                choiceMade = null;
                return;
            }
        }

        showScene(nextId);
    }

    // Load the story data
    async function loadStory() {
        try {
            const res = await fetch(config.storyPath);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Response is not JSON");
            }
            
            storyData = await res.json();

            const imageUrls = storyData
                .filter(scene => scene.image)
                .map(scene => scene.image);
            await preloadImages(imageUrls);

            const audioUrls = [];
            storyData.forEach(scene => {
                if (scene.audio) audioUrls.push(scene.audio);
                if (scene.multiAudio) {
                    for (let key in scene.multiAudio) {
                        audioUrls.push(scene.multiAudio[key]);
                    }
                }
            });

            const uniqueUrls = [...new Set(audioUrls)];
            for (let url of uniqueUrls) {
                if (url) {
                    buffers[url] = await loadAudio(url);
                }
            }

            const start = storyData.find(s => s.name === "START");
            if (!start) {
                throw new Error("No START scene found in story data");
            }

            const startText = (start.text || 'Welcome adventurer...')
                .replace(/\n/g, '<br>')
                .replace(/\[\[.*?\]\]/g, '');

            const startImage = start.image ? await loadImageAsBlob(start.image) : '';

            document.getElementById("game").innerHTML = `
                <div class="image-text-container">
                    ${startImage ? `<img src="${startImage}" alt="" class="fade-in" crossOrigin="anonymous" onload="this.classList.add('loaded')">` : ''}
                    <div class="text-block">${startText}</div>
                </div>
                <div class="button" onclick="window.StoryEngine.startScene()">BEGIN YOUR ADVENTURE</div>
            `;
        } catch (err) {
            console.error('Failed to load story:', err);
            document.getElementById("game").innerHTML = `
                <p>❌ Failed to load story.json</p>
                <p>Make sure story.json exists and is valid JSON.</p>
                <p>Error: ${err.message}</p>
            `;
        }
    }

    // Start the first scene
    function startScene() {
        // First try to find a scene with ID "BEGIN YOUR ADVENTURE"
        let firstScene = storyData.find(s => s.id === "BEGIN YOUR ADVENTURE");
        
        // If not found, try to find a scene with a choice labeled "BEGIN YOUR ADVENTURE"
        if (!firstScene) {
            firstScene = storyData.find(s => s.choices?.some(c => c.label === "BEGIN YOUR ADVENTURE"));
        }
        
        if (firstScene) {
            showScene(firstScene.id);
        } else {
            console.error("Could not find first scene");
            document.getElementById("game").innerHTML = `<p>❌ Could not find first scene</p>`;
        }
    }

    // Download the comic based on visited images
    async function downloadComic() {
        try {
            const journeyImages = visitedImages.slice(0, 5);
            const journeyTexts = visitedTexts.slice(0, 5);
            
            if (journeyImages.length === 0) {
                alert("No images available from your journey. Try playing through the story first!");
                return;
            }

            const blobUrls = await Promise.all(journeyImages.map(loadImageAsBlob));
            
            const svg = document.querySelector("#comicSvgWrapper svg");
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

            const canvas = document.getElementById('comicCanvas');
            canvas.width = 2048;
            canvas.height = 2860;
            const ctx = canvas.getContext("2d");

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const v = await canvg.Canvg.fromString(ctx, svg.outerHTML);
            await v.render();

            const imgData = canvas.toDataURL("image/png");

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
        } catch (error) {
            console.error("Error generating comic:", error);
            alert("Sorry, there was an error generating your comic. Please try again.");
        }
    }

    // Download audio journey based on visited audio
    async function downloadAudioJourney() {
        try {
            if (visitedAudio.length === 0) {
                alert("No audio available from your journey. Try playing through the story first!");
                return;
            }

            const offlineContext = new OfflineAudioContext({
                numberOfChannels: 2,
                length: 44100 * visitedAudio.reduce((total, url) => total + (buffers[url]?.duration || 0), 0),
                sampleRate: 44100
            });

            let currentTime = 0;
            for (const audioUrl of visitedAudio) {
                const buffer = buffers[audioUrl];
                if (!buffer) continue;

                const source = offlineContext.createBufferSource();
                source.buffer = buffer;
                source.connect(offlineContext.destination);
                source.start(currentTime);
                currentTime += buffer.duration;
            }

            const renderedBuffer = await offlineContext.startRendering();

            const numberOfChannels = renderedBuffer.numberOfChannels;
            const length = renderedBuffer.length;
            const sampleRate = renderedBuffer.sampleRate;
            const bitsPerSample = 16;
            const bytesPerSample = bitsPerSample / 8;
            const blockAlign = numberOfChannels * bytesPerSample;
            const byteRate = sampleRate * blockAlign;
            const dataSize = length * blockAlign;

            const buffer = new ArrayBuffer(44 + dataSize);
            const view = new DataView(buffer);

            writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + dataSize, true);
            writeString(view, 8, 'WAVE');
            writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, numberOfChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, byteRate, true);
            view.setUint16(32, blockAlign, true);
            view.setUint16(34, bitsPerSample, true);
            writeString(view, 36, 'data');
            view.setUint32(40, dataSize, true);

            const channels = [];
            for (let i = 0; i < numberOfChannels; i++) {
                channels.push(renderedBuffer.getChannelData(i));
            }

            let offset = 44;
            for (let i = 0; i < length; i++) {
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    const sample = Math.max(-1, Math.min(1, channels[channel][i]));
                    view.setInt16(offset, sample * 0x7FFF, true);
                    offset += 2;
                }
            }

            const blob = new Blob([buffer], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'your-sonic-journey.wav';
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error generating audio journey:', error);
            alert('Sorry, there was an error generating your audio journey. Please try again.');
        }
    }

    // Utility function for writing strings to DataView
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Change the game skin
    function changeSkin(skinName) {
        const themeLink = document.getElementById('theme-style');
        themeLink.href = `skins/${skinName}/style.css`;
        config.skin = skinName;
    }

    // Initialize the game
    function init(options = {}) {
        config = { ...config, ...options };
        initAudioContext();
        loadStory();
    }

    // Public API
    return {
        init,
        startScene,
        handleChoice,
        switchToTrack,
        downloadComic,
        downloadAudioJourney,
        changeSkin
    };
})();

// Export the StoryEngine to the window object
window.StoryEngine = StoryEngine;