// AudioManager.js - Handles all audio-related functionality
class AudioManager {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 44100
        });
        this.buffers = {};
        this.currentSource = null;
        this.multiAudioSources = {};
        this.multiAudioGains = {};
        this.currentMultiAudio = null;
    }
    
    async loadAudio(url) {
        if (!url) return null;
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error('Error loading audio:', error);
            return null;
        }
    }
    
    async preloadAudio(urls) {
        const uniqueUrls = [...new Set(urls.filter(Boolean))];
        const promises = uniqueUrls.map(async url => {
            this.buffers[url] = await this.loadAudio(url);
        });
        await Promise.all(promises);
    }
    
    playAudio(name, loop = false, onEnded = null) {
        this.stopAudio();
        const buffer = this.buffers[name];
        if (!buffer) return;

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
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
        this.currentSource = source;
    }
    
    stopAudio() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Ignore errors when stopping already stopped sources
            }
            this.currentSource.disconnect();
            this.currentSource = null;
            this.stopMultiAudio();
        }
    }
    
    async playMultiAudio(multiAudioMap, onEnded = null) {
        this.stopAudio();
        this.stopMultiAudio();

        this.multiAudioSources = {};
        this.multiAudioGains = {};

        const labels = Object.keys(multiAudioMap || {});
        if (labels.length === 0) return;

        const promises = [];

        for (let label of labels) {
            const url = multiAudioMap[label];
            const promise = this.loadAudio(url).then(buffer => {
                if (!buffer) return;
                
                const source = this.audioContext.createBufferSource();
                source.buffer = buffer;
                source.loop = true;

                const gainNode = this.audioContext.createGain();
                gainNode.gain.value = 0;

                source.connect(gainNode).connect(this.audioContext.destination);
                this.multiAudioSources[label] = source;
                this.multiAudioGains[label] = gainNode;
            });
            promises.push(promise);
        }

        await Promise.all(promises);

        Object.values(this.multiAudioSources).forEach(src => src.start(0));
        this.currentMultiAudio = true;
        const firstTrack = Object.keys(this.multiAudioSources)[0];
        if (firstTrack) {
            this.multiAudioGains[firstTrack].gain.value = 1;
        }

        if (onEnded) {
            Object.values(this.multiAudioSources).forEach(source => {
                source.onended = onEnded;
            });
        }
    }
    
    stopMultiAudio() {
        for (let label in this.multiAudioSources) {
            try { 
                this.multiAudioSources[label].stop(); 
            } catch (e) {
                // Ignore errors when stopping already stopped sources
            }
            this.multiAudioSources[label].disconnect();
        }
        this.multiAudioSources = {};
        this.multiAudioGains = {};
        this.currentMultiAudio = null;
    }
    
    switchToTrack(label) {
        if (!this.multiAudioGains[label]) return;
        for (let l in this.multiAudioGains) {
            this.multiAudioGains[l].gain.value = l === label ? 1 : 0;
        }
    }
    
    async downloadAudioJourney(visitedAudio) {
        try {
            if (visitedAudio.length === 0) {
                alert("No audio available from your journey. Try playing through the story first!");
                return;
            }

            const offlineContext = new OfflineAudioContext({
                numberOfChannels: 2,
                length: 44100 * visitedAudio.reduce((total, url) => total + (this.buffers[url]?.duration || 0), 0),
                sampleRate: 44100
            });

            let currentTime = 0;
            for (const audioUrl of visitedAudio) {
                const buffer = this.buffers[audioUrl];
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

            this.writeString(view, 0, 'RIFF');
            view.setUint32(4, 36 + dataSize, true);
            this.writeString(view, 8, 'WAVE');
            this.writeString(view, 12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, numberOfChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, byteRate, true);
            view.setUint16(32, blockAlign, true);
            view.setUint16(34, bitsPerSample, true);
            this.writeString(view, 36, 'data');
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

            return true;
        } catch (error) {
            console.error('Error generating audio journey:', error);
            alert('Sorry, there was an error generating your audio journey. Please try again.');
            return false;
        }
    }
    
    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}

export default AudioManager;