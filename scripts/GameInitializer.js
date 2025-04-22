// GameInitializer.js - Initializes the game and manages the overall state
import SkinManager from '../skin-manager.js';

class GameInitializer {
    constructor() {
        this.skinManager = new SkinManager();
    }
    
    async initialize() {
        // Initialize the skin manager
        await this.skinManager.initialize();
        
        // Initialize the story engine with the default config
        if (window.StoryEngine) {
            window.StoryEngine.init({
                storyPath: 'story.json',
                skin: this.skinManager.currentSkin
            });
        }
        
        // Add a control panel for skin selection
        this.createControlPanel();
    }
    
    createControlPanel() {
        const controlPanel = document.createElement('div');
        controlPanel.className = 'control-panel';
        controlPanel.style.position = 'fixed';
        controlPanel.style.bottom = '10px';
        controlPanel.style.right = '10px';
        controlPanel.style.zIndex = '1000';
        
        // Add skin selection
        const skinSelector = document.createElement('div');
        skinSelector.innerHTML = `
            <label for="skin-select">Theme: </label>
            <select id="skin-select">
                ${this.skinManager.getSkins().map(skin => 
                    `<option value="${skin}">${skin.charAt(0).toUpperCase() + skin.slice(1)}</option>`
                ).join('')}
            </select>
        `;
        
        const select = skinSelector.querySelector('select');
        select.value = this.skinManager.currentSkin;
        select.addEventListener('change', () => {
            this.skinManager.loadSkin(select.value);
        });
        
        controlPanel.appendChild(skinSelector);
        document.body.appendChild(controlPanel);
    }
}

export default GameInitializer;