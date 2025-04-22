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
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 44100
            });
        }
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
        const promises = imageUrls.filter(url => url).map(loadImageAsBlob);
        await Promise.all(promises);
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

        for (const label of labels) {
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
        Object.values(multiAudioSources).forEach(source => {
            try { 
                source.stop(); 
            } catch (e) {
                // Ignore errors when stopping already stopped sources
            }
            source.disconnect();
        });
        multiAudioSources = {};
        multiAudioGains = {};
        currentMultiAudio = null;
    }

    // Switch between multi-track audio
    function switchToTrack(label) {
        if (!multiAudioGains[label]) return;
        Object.keys(multiAudioGains).forEach(l => {
            multiAudioGains[l].gain.value = l === label ? 1 : 0;
        });
    }

    // Display a scene
    async function showScene(sceneId) {
        const scene = storyData.find(s => s.id === sceneId || s.name === sceneId);
        if (!scene) {
            document.getElementById("game").innerHTML = `<p>❌ Scene not found: ${sceneId}</p>`;
            return;
        }
        currentScene = scene;
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
            const isFinal = !scene.choices || scene.choices.length === 0;
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
            await playMultiAudio(scene.multiAudio, () => {
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

        if (isLoopingScene) {
            choiceMade = nextId;

            const buttons = document.querySelectorAll(".button");
            buttons.forEach(btn => {
                if (btn.textContent === selectedChoice?.label) {
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
            storyData = await res.json();

            const imageUrls = storyData
                .filter(scene => scene.image)
                .map(scene => scene.image);
            await preloadImages(imageUrls);

            const audioUrls = [];
            storyData.forEach(scene => {
                if (scene.audio) audioUrls.push(scene.audio);
                if (scene.multiAudio) {
                    Object.values(scene.multiAudio).forEach(url => {
                        audioUrls.push(url);
                    });
                }
            });

            const uniqueUrls = [...new Set(audioUrls)];
            const audioPromises = uniqueUrls.filter(url => url).map(async url => {
                buffers[url] = await loadAudio(url);
            });
            await Promise.all(audioPromises);

            const start = storyData.find(s => s.name === "START");

            const startText = (start?.text || 'Welcome adventurer...')
                .replace(/\n/g, '<br>')
                .replace(/\[\[.*?\]\]/g, '');

            const startImage = start?.image ? await loadImageAsBlob(start.image) : '';

            document.getElementById("game").innerHTML = `
                <div class="image-text-container">
                ${startImage ? `<img src="${startImage}" alt="" class="fade-in" crossOrigin="anonymous" onload="this.classList.add('loaded')">` : ''}
                <div class="text-block">${startText}</div>
                </div>
                <div class="button" onclick="window.StoryEngine.startScene()">BEGIN YOUR ADVENTURE</div>
            `;
        } catch (err) {
            document.getElementById("game").innerHTML = `<p>❌ Failed to load story.json<br>${err}</p>`;
            console.error(err);
        }
    }

    // Start the first scene
    function startScene() {
        showScene("BEGIN YOUR ADVENTURE");
    }

    // Initialize the game
    async function init(options = {}) {
        try {
            config = { ...config, ...options };
            initAudioContext();
            await loadStory();
        } catch (error) {
            console.error('StoryEngine failed to initialize:', error);
            throw new Error('StoryEngine failed to initialize');
        }
    }

    // Public API
    return {
        init,
        startScene,
        handleChoice,
        switchToTrack,
        downloadComic: () => import('./scripts/ComicGenerator.js').then(m => new m.default().downloadComic(visitedImages, visitedTexts, storyData)),
        downloadAudioJourney: () => import('./scripts/AudioManager.js').then(m => new m.default().downloadAudioJourney(visitedAudio))
    };
})();

// Export the StoryEngine to the window object
window.StoryEngine = StoryEngine;

// Notify that the module has loaded
window.dispatchEvent(new Event('storyengine-loaded'));