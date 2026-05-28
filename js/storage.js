/**
 * wApp Storage Module
 * IndexedDB wrapper for persistent storage
 */

class StorageModule {
  constructor() {
    this.dbName = 'wapp-db';
    this.dbVersion = 1;
    this.db = null;
  }

  /**
   * Initialize IndexedDB
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[Storage] IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains('tokens')) {
          db.createObjectStore('tokens', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('wallet')) {
          db.createObjectStore('wallet', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        console.log('[Storage] Database upgraded to version', db.version);
      };
    });
  }

  /**
   * Save tokens (access + refresh)
   */
  async saveTokens(accessToken, refreshToken) {
    const transaction = this.db.transaction(['tokens'], 'readwrite');
    const store = transaction.objectStore('tokens');
    
    await store.put({
      id: 'current',
      accessToken,
      refreshToken,
      timestamp: Date.now()
    });

    console.log('[Storage] Tokens saved');
  }

  /**
   * Get tokens
   */
  async getTokens() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tokens'], 'readonly');
      const store = transaction.objectStore('tokens');
      const request = store.get('current');

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          console.log('[Storage] Tokens retrieved');
          resolve({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            timestamp: result.timestamp
          });
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear tokens (logout)
   */
  async clearTokens() {
    const transaction = this.db.transaction(['tokens'], 'readwrite');
    const store = transaction.objectStore('tokens');
    await store.delete('current');
    console.log('[Storage] Tokens cleared');
  }

  /**
   * Save wallet data (balance, address, status)
   */
  async saveWalletData(data) {
    const transaction = this.db.transaction(['wallet'], 'readwrite');
    const store = transaction.objectStore('wallet');
    
    await store.put({
      id: 'current',
      ...data,
      timestamp: Date.now()
    });

    console.log('[Storage] Wallet data saved');
  }

  /**
   * Get wallet data
   */
  async getWalletData() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['wallet'], 'readonly');
      const store = transaction.objectStore('wallet');
      const request = store.get('current');

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save a setting
   */
  async saveSetting(key, value) {
    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    await store.put({ key, value });
  }

  /**
   * Get a setting
   */
  async getSetting(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save settings object
   */
  async saveSettings(settings) {
    const transaction = this.db.transaction(['settings'], 'readwrite');
    const store = transaction.objectStore('settings');
    
    // Save each setting individually
    for (const [key, value] of Object.entries(settings)) {
      await store.put({ key, value });
    }
    
    console.log('[Storage] Settings saved');
  }

  /**
   * Get all settings
   */
  async getSettings() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        const settings = {};
        
        // Convert array to object
        for (const item of results) {
          settings[item.key] = item.value;
        }
        
        // Apply defaults if not set
        if (!settings.displayUnit) {
          settings.displayUnit = 'μBTC';
        }
        
        resolve(settings);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data
   */
  async clearAll() {
    const stores = ['tokens', 'wallet', 'settings'];
    const transaction = this.db.transaction(stores, 'readwrite');
    
    for (const storeName of stores) {
      const store = transaction.objectStore(storeName);
      await store.clear();
    }

    console.log('[Storage] All data cleared');
  }
}

// Export singleton instance
const storage = new StorageModule();
