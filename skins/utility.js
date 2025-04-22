// Utility functions for skin management

/**
 * Loads a skin and applies it to the game
 * @param {string} skinName - The name of the skin to load
 */
export function loadSkin(skinName) {
    const themeLink = document.getElementById('theme-style');
    themeLink.href = `skins/${skinName}/style.css`;
}

/**
 * Get a list of available skins
 * @returns {Promise<string[]>} - List of available skin names
 */
export async function getAvailableSkins() {
    try {
        const response = await fetch('skins/index.json');
        if (!response.ok) {
            throw new Error('Failed to load skin index');
        }
        const data = await response.json();
        return data.skins || [];
    } catch (error) {
        console.error('Error loading skins:', error);
        return ['western']; // Default fallback
    }
}

/**
 * Creates a skin selector UI
 * @param {HTMLElement} container - The container to add the skin selector to
 * @param {Function} onSkinChange - Callback when skin is changed
 */
export async function createSkinSelector(container, onSkinChange) {
    const skins = await getAvailableSkins();
    
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'skin-selector';
    
    const label = document.createElement('label');
    label.textContent = 'Theme: ';
    label.htmlFor = 'skin-select';
    
    const select = document.createElement('select');
    select.id = 'skin-select';
    
    skins.forEach(skin => {
        const option = document.createElement('option');
        option.value = skin;
        option.textContent = skin.charAt(0).toUpperCase() + skin.slice(1);
        select.appendChild(option);
    });
    
    select.addEventListener('change', () => {
        const selectedSkin = select.value;
        loadSkin(selectedSkin);
        if (onSkinChange) {
            onSkinChange(selectedSkin);
        }
    });
    
    selectorDiv.appendChild(label);
    selectorDiv.appendChild(select);
    container.appendChild(selectorDiv);
    
    return selectorDiv;
}