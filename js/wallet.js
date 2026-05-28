/**
 * wApp Wallet Module
 * Manages wallet state and operations
 */

/**
 * Unit Configuration
 * Defines the three display units and their properties
 */
const UNIT_CONFIG = {
  'BTC': {
    divisor: 100000000,
    decimals: 8,
    label: 'BTC'
  },
  'μBTC': {
    divisor: 100,
    decimals: 2,
    label: 'μBTC'
  },
  'sat': {
    divisor: 1,
    decimals: 0,
    label: 'sat'
  }
};

/**
 * Unit Conversion Utilities
 */
const UnitConverter = {
  /**
   * Get unit configuration
   */
  getUnitConfig(unit) {
    return UNIT_CONFIG[unit] || UNIT_CONFIG['μBTC'];
  },

  /**
   * Convert satoshis to display amount
   * @param {number} sats - Amount in satoshis (integer)
   * @param {string} unit - Display unit ('BTC', 'μBTC', or 'sat')
   * @returns {number} Amount in display unit
   */
  satToDisplay(sats, unit) {
    if (sats === null || sats === undefined) return null;
    const config = this.getUnitConfig(unit);
    return sats / config.divisor;
  },

  /**
   * Convert display amount to satoshis
   * @param {number} amount - Amount in display unit
   * @param {string} unit - Display unit ('BTC', 'μBTC', or 'sat')
   * @returns {number} Amount in satoshis (integer, floored)
   */
  displayToSat(amount, unit) {
    if (amount === null || amount === undefined || amount === '') return null;
    const config = this.getUnitConfig(unit);
    // Always floor to prevent fractional satoshis
    return Math.floor(Number(amount) * config.divisor);
  },

  /**
   * Format satoshis for display with proper decimals and label
   * @param {number} sats - Amount in satoshis (integer)
   * @param {string} unit - Display unit ('BTC', 'μBTC', or 'sat')
   * @param {boolean} includeLabel - Include unit label (default: true)
   * @returns {string} Formatted amount string
   */
  formatAmount(sats, unit, includeLabel = true) {
    if (sats === null || sats === undefined) return '---';
    
    const config = this.getUnitConfig(unit);
    const amount = this.satToDisplay(sats, unit);
    const formatted = amount.toFixed(config.decimals);
    
    return includeLabel ? `${formatted} ${config.label}` : formatted;
  },

  /**
   * Validate that a value is a valid integer in satoshis
   * @param {any} value - Value to validate
   * @returns {boolean} True if valid integer
   */
  isValidSatoshis(value) {
    return Number.isInteger(value) && value >= 0;
  }
};

class WalletModule {
  constructor() {
    this.address = null;
    this.balance = null;
    this.walletExists = false;
    this.rpcConnected = false;
    this.statusChecked = false; // Track if status has been successfully checked
    this.blockHeight = null;
    this.lastUpdate = null;
    this.balanceFetched = false; // Track if balance was successfully fetched
    this.created = null; // Wallet creation timestamp (ISO string)
    this.firstBlockTimestamp = null; // First block timestamp from node (Unix seconds)
    this.lastBlockTimestamp = null;  // Last block timestamp from node (Unix seconds)
    this.isSyncing = false; // Track if status check is in progress
    this.isFetchingBalance = false; // Track if balance fetch is in progress
  }

  /**
   * Load wallet from storage
   */
  async loadFromStorage() {
    const data = await storage.getWalletData();
    if (data) {
      this.address = data.address;
      this.balance = data.balance;
      this.walletExists = data.walletExists;
      this.rpcConnected = data.rpcConnected;
      this.statusChecked = data.statusChecked || false;
      this.blockHeight = data.blockHeight;
      this.lastUpdate = data.timestamp;
      this.balanceFetched = data.balanceFetched || false;
      this.created = data.created || null;
      this.firstBlockTimestamp = data.firstBlockTimestamp || null;
      this.lastBlockTimestamp = data.lastBlockTimestamp || null;
      console.log('[Wallet] Loaded from storage');
      return true;
    }
    return false;
  }

  /**
   * Save wallet to storage
   */
  async saveToStorage() {
    await storage.saveWalletData({
      address: this.address,
      balance: this.balance,
      walletExists: this.walletExists,
      rpcConnected: this.rpcConnected,
      statusChecked: this.statusChecked,
      blockHeight: this.blockHeight,
      balanceFetched: this.balanceFetched,
      created: this.created,
      firstBlockTimestamp: this.firstBlockTimestamp,
      lastBlockTimestamp: this.lastBlockTimestamp
    });
    this.lastUpdate = Date.now();
    console.log('[Wallet] Saved to storage');
  }

  /**
   * Update wallet status from server
   */
  async updateStatus() {
    try {
      const status = await api.getWalletStatus();
      this.walletExists = status.wallet_exists;
      this.rpcConnected = status.rpc_connected;
      
      console.log('[Wallet] Status updated:', status);
      return status;
    } catch (error) {
      console.error('[Wallet] Failed to update status:', error);
      this.rpcConnected = false;
      throw error;
    }
  }

  /**
   * Update wallet info (address)
   */
  async updateInfo() {
    try {
      console.log('[Wallet] Fetching wallet address...');
      const info = await api.getAddress();
      console.log('[Wallet] Address API response:', info);
      this.address = info.address;
      console.log('[Wallet] Address updated:', this.address);
      return info;
    } catch (error) {
      console.error('[Wallet] Failed to get address:', error);
      console.error('[Wallet] Error details:', error.message);
      throw error;
    }
  }

  /**
   * Update wallet metadata (creation date, etc.)
   */
  async updateMetadata() {
    try {
      console.log('[Wallet] Fetching wallet metadata...');
      const info = await api.getWalletInfo();
      console.log('[Wallet] Wallet info API response:', info);
      
      if (info.created) {
        this.created = info.created;
        console.log('[Wallet] Creation date:', this.created);
      }
      
      return info;
    } catch (error) {
      console.error('[Wallet] Failed to get wallet metadata:', error);
      throw error;
    }
  }

  /**
   * Update balance
   */
  async updateBalance() {
    try {
      const balanceData = await api.getBalance();
      console.log('[Wallet] Balance API response:', balanceData);
      
      // Store balance in satoshis (integer) - API provides balance_sats
      this.balance = balanceData.balance_sats || 0;
      this.balanceFetched = true; // Mark that balance was successfully fetched
      this.blockHeight = balanceData.lastblock_height;
      this.firstBlockTimestamp = balanceData.firstblock_timestamp || null;
      this.lastBlockTimestamp = balanceData.lastblock_timestamp || null;
      
      console.log('[Wallet] Balance updated:', this.balance, 'sats at block', this.blockHeight);
      if (this.firstBlockTimestamp) {
        console.log('[Wallet] First block timestamp:', this.firstBlockTimestamp);
      }

      this.lastUpdate = Date.now();
      await this.saveToStorage();
      
      return balanceData;
    } catch (error) {
      console.error('[Wallet] Failed to update balance:', error);
      this.balanceFetched = false;
      throw error;
    }
  }

  /**
   * Fast status sync - check wallet exists and node connected (< 1 second)
   */
  async syncStatus() {
    console.log('[Wallet] Checking status...');
    this.isSyncing = true;
    
    try {
      // Fast operations only - no UTXO scanning
      await this.updateStatus();
      console.log('[Wallet] Status: exists=', this.walletExists, 'rpc=', this.rpcConnected);
      
      if (this.walletExists) {
        await this.updateInfo();      // Get address
        await this.updateMetadata();  // Get creation date
        console.log('[Wallet] Info updated - address:', this.address);
      }
      
      this.statusChecked = true;
    } catch (error) {
      console.error('[Wallet] Status check failed:', error);
      // statusChecked remains false - we don't know the real state
    } finally {
      this.isSyncing = false;
      await this.saveToStorage();
    }
  }

  /**
   * Balance sync - slow UTXO scan (60-120 seconds)
   */
  async syncBalance() {
    if (!this.walletExists || !this.rpcConnected) {
      console.log('[Wallet] Skipping balance sync - no wallet or no node');
      return;
    }
    
    console.log('[Wallet] Fetching balance from blockchain...');
    this.isFetchingBalance = true;
    
    try {
      await this.updateBalance();
      console.log('[Wallet] Balance updated:', this.balance);
    } catch (error) {
      console.error('[Wallet] Balance fetch failed:', error);
    } finally {
      this.isFetchingBalance = false;
      await this.saveToStorage();
    }
  }

  /**
   * Get time since last update
   */
  getTimeSinceUpdate() {
    if (!this.lastUpdate) return null;
    
    const diff = Date.now() - this.lastUpdate;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'just now';
  }

  /**
   * Format balance for display
   * @param {string} unit - Display unit ('BTC', 'μBTC', or 'sat')
   * @returns {string} Formatted balance string
   */
  formatBalance(unit = 'μBTC') {
    return UnitConverter.formatAmount(this.balance, unit);
  }

  /**
   * Check if node is pruned and wallet predates first block
   * @returns {Object} { isPruned: boolean, createdDate: Date|null, firstBlockDate: Date|null }
   */
  checkPrunedWarning() {
    // Need both timestamps to compare
    if (!this.created || !this.firstBlockTimestamp) {
      return { isPruned: false, createdDate: null, firstBlockDate: null };
    }
    
    try {
      // Convert ISO string to Unix timestamp (seconds)
      const createdDate = new Date(this.created);
      const createdUnix = Math.floor(createdDate.getTime() / 1000);
      
      // firstBlockTimestamp is already Unix seconds
      const firstBlockUnix = this.firstBlockTimestamp;
      
      // If wallet created before first block in node, data may be incomplete
      const isPruned = createdUnix < firstBlockUnix;
      
      const firstBlockDate = new Date(firstBlockUnix * 1000);
      
      console.log('[Wallet] Pruned check:', {
        created: this.created,
        createdUnix,
        firstBlockUnix,
        isPruned,
        createdDate: createdDate.toISOString(),
        firstBlockDate: firstBlockDate.toISOString()
      });
      
      return { isPruned, createdDate, firstBlockDate };
    } catch (error) {
      console.error('[Wallet] Error checking pruned warning:', error);
      return { isPruned: false, createdDate: null, firstBlockDate: null };
    }
  }

  /**
   * Check if the last block is stale (> 1 hour old)
   * @returns {Object} { isStale: boolean, hours: number, minutes: number }
   */
  checkStaleNodeWarning() {
    if (!this.lastBlockTimestamp) {
      return { isStale: false, hours: 0, minutes: 0 };
    }
    const diffSeconds = Math.floor(Date.now() / 1000) - this.lastBlockTimestamp;
    const totalMinutes = Math.floor(diffSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return { isStale: diffSeconds > 3600, hours, minutes };
  }

  /**
   * Copy address to clipboard
   */
  async copyAddress() {
    if (!this.address) return false;
    
    try {
      await navigator.clipboard.writeText(this.address);
      console.log('[Wallet] Address copied to clipboard');
      return true;
    } catch (error) {
      console.error('[Wallet] Failed to copy address:', error);
      return false;
    }
  }
}

// Export singleton instance
const wallet = new WalletModule();
