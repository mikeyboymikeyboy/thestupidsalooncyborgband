// Skin Manager - Handles skin loading and switching
import { loadSkin, getAvailableSkins, createSkinSelector } from './skins/utility.js';

class SkinManager {
    constructor() {
        this.currentSkin = 'western';
        this.availableSkins = [];
    }
    
    async initialize() {
        try {
            this.availableSkins = await getAvailableSkins();
            
            // Create a skin selection UI
            this.createSkinUI();
            
            // Load the default skin
            this.loadSkin(this.currentSkin);
        } catch (error) {
            console.error('Error initializing skin manager:', error);
        }
    }
    
    loadSkin(skinName) {
        if (!this.availableSkins.includes(skinName)) {
            console.warn(`Skin "${skinName}" not found, using default`);
            skinName = 'western';
        }
        
        this.currentSkin = skinName;
        loadSkin(skinName);
        
        // Save the selected skin preference
        localStorage.setItem('preferredSkin', skinName);
        
        // Notify the story engine about the skin change
        if (window.StoryEngine && window.StoryEngine.changeSkin) {
            window.StoryEngine.changeSkin(skinName);
        }
    }
    
    createSkinUI() {
        // Create a theme selector in the top-right corner
        const container = document.createElement('div');
        container.className = 'skin-selector-container';
        container.style.position = 'fixed';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.zIndex = '1000';
        
        createSkinSelector(container, (skin) => this.loadSkin(skin));
        
        document.body.appendChild(container);
    }
    
    getSkins() {
        return this.availableSkins;
    }
}

export default SkinManager;