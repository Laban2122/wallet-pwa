/**
 * wApp - Main Application Logic
 */

class WalletApp {
  constructor() {
    this.initialized = false;
    this.paired = false;
    this.currentView = 'loading';
    this.qrScanner = null;
    this.updateTimer = null;
    this.currentUnit = 'μBTC'; // Default unit
  }

  /**
   * Initialize the application
   */
  async init() {
    console.log('[App] Initializing wApp...');

    try {
      // Initialize storage
      await storage.init();

      // Load settings
      const settings = await storage.getSettings();
      this.currentUnit = settings.displayUnit || 'μBTC';
      console.log('[App] Display unit:', this.currentUnit);

      // Register service worker
      await this.registerServiceWorker();

      // Handle external server URL and session params (?server=...&session=...)
      const urlParams = new URLSearchParams(window.location.search);
      const serverParam = urlParams.get('server');
      const sessionParam = urlParams.get('session');

      if (serverParam) {
        api.baseURL = serverParam;
        await storage.saveSetting('serverURL', serverParam);
        console.log('[App] Server URL from param:', serverParam);
      } else {
        const savedServer = await storage.getSetting('serverURL');
        if (savedServer) {
          api.baseURL = savedServer;
          console.log('[App] Server URL from storage:', savedServer);
        }
      }

      // Check if we're on a pairing URL — path-based (local) or param-based (external PWA)
      const path = window.location.pathname;
      const pairingMatch = path.match(/^\/pair\/([a-zA-Z0-9_-]+)$/);

      if (pairingMatch) {
        const sessionId = pairingMatch[1];
        console.log('[App] Detected pairing URL with session:', sessionId);
        this.showPairing();
        await this.completePairingWithSession(sessionId);
        return;
      } else if (sessionParam) {
        console.log('[App] Detected pairing session param:', sessionParam);
        this.showPairing();
        await this.completePairingWithSession(sessionParam);
        return;
      }

      // Check for saved tokens
      const tokens = await storage.getTokens();
      if (tokens) {
        console.log('[App] Found saved tokens');
        api.setTokens(tokens.accessToken, tokens.refreshToken);
        this.paired = true;
        
        this.updateDebugInfo(); // Update debug info with loaded tokens

        // Try to refresh access token
        try {
          const refreshResult = await api.refreshAccessToken();
          await storage.saveTokens(refreshResult.access_token, tokens.refreshToken);
          console.log('[App] Access token refreshed');
          this.updateDebugInfo(); // Update debug info with refreshed token
        } catch (error) {
          console.warn('[App] Token refresh failed, may need to re-pair');
        }

        // Load wallet data
        await wallet.loadFromStorage();
        
        // Fast status check first (< 1s)
        await this.syncWalletStatus();
        
        // Show dashboard with fresh data
        this.showDashboard();
        
        // Then slow balance fetch in background (60-120s)
        this.syncWalletBalance();
        
        // Start timer to update balance label every minute
        this.startUpdateTimer();
      } else {
        console.log('[App] No tokens found, need to pair');
        this.showPairing();
      }

      this.initialized = true;
      console.log('[App] Initialization complete');
    } catch (error) {
      console.error('[App] Initialization failed:', error);
      this.showError('Failed to initialize app');
    }
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[App] Service worker registered:', registration.scope);

        // Check for updates
        registration.addEventListener('updatefound', () => {
          console.log('[App] Service worker update found');
        });
      } catch (error) {
        console.error('[App] Service worker registration failed:', error);
      }
    }
  }

  /**
   * Complete pairing with session ID from URL
   */
  async completePairingWithSession(sessionId) {
    console.log('[App] Completing pairing with session:', sessionId);
    this.showMessage('Completing pairing...', 'info');

    try {
      const result = await api.completePairingWithSession(sessionId, 'Android Device');
      console.log('[App] Pairing complete:', result);

      // Save tokens
      await storage.saveTokens(result.access_token, result.refresh_token);
      api.setTokens(result.access_token, result.refresh_token);
      this.paired = true;
      
      this.updateDebugInfo(); // Update debug info with token

      this.showMessage('✓ Device paired successfully!', 'success');

      // Redirect to home and show dashboard
      window.history.replaceState({}, '', '/');
      
      setTimeout(() => {
        this.showDashboard();
        this.syncWallet();
      }, 1500);
    } catch (error) {
      console.error('[App] Pairing failed:', error);
      this.showMessage(`✗ Pairing failed: ${error.message}\n\nThe session may have expired. Please scan the QR code again.`, 'error');
    }
  }

  /**
   * Refresh balance only (called by refresh icon)
   */
  async refreshBalance() {
    console.log('[App] Refreshing balance...');
    
    try {
      // Set flag and update UI to show "Scanning..."
      wallet.isFetchingBalance = true;
      this.updateDashboard();
      
      // Fetch balance from blockchain
      await wallet.updateBalance();
      
      console.log('[App] Balance refreshed successfully');
    } catch (error) {
      console.error('[App] Failed to refresh balance:', error);
    } finally {
      // Clear flag and update UI with result
      wallet.isFetchingBalance = false;
      this.updateDashboard();
    }
  }

  /**
   * Fast status check - updates banner info (< 1 second)
   */
  async syncWalletStatus() {
    console.log('[App] Checking wallet status...');
    console.log('[App] Access token set:', !!api.accessToken ? 'YES' : 'NO');
    console.log('[App] Token preview:', api.accessToken ? api.accessToken.substring(0, 20) + '...' : 'null');
    
    try {
      await wallet.syncStatus();
      this.updateDashboard();
      this.updateDebugInfo();
    } catch (error) {
      console.error('[App] Status check error:', error);
      this.updateDashboard();
      this.updateDebugInfo();
    }
  }
  
  /**
   * Slow balance fetch - runs in background (60-120 seconds)
   */
  async syncWalletBalance() {
    console.log('[App] Fetching balance...');
    
    try {
      await wallet.syncBalance();
      this.updateDashboard();
      this.updateDebugInfo();
    } catch (error) {
      console.error('[App] Balance fetch error:', error);
      this.updateDashboard();
      this.updateDebugInfo();
    }
  }

  /**
   * Full sync - status then balance (used by refresh button)
   */
  async syncWallet() {
    await this.syncWalletStatus();
    await this.syncWalletBalance();
  }

  /**
   * Update dashboard with current wallet data
   */
  updateDashboard() {
    // Update status - show both wallet and RPC status
    const statusEl = document.getElementById('walletStatus');
    if (statusEl) {
      let statusText = '';
      let statusClass = '';
      
      // Show "Checking..." during status check
      if (wallet.isSyncing) {
        statusText = 'Checking status...';
        statusClass = 'status-text';
      }
      // After status check, show result
      else if (wallet.statusChecked) {
        // First show wallet found/not found
        if (wallet.walletExists) {
          statusText = '✓ Wallet found';
          statusClass = 'status-success';
        } else {
          statusText = '⚠️ Wallet not found';
          statusClass = 'status-warning';
        }
        
        // Always show RPC/Node status
        if (wallet.rpcConnected) {
          statusText += ' • ✓ Node connected';
          const stale = wallet.checkStaleNodeWarning();
          if (stale.isStale) {
            const ageText = stale.hours > 0
              ? `${stale.hours}h ${stale.minutes}m`
              : `${stale.minutes}m`;
            statusText += ` • ⚠️ Last block ${ageText} ago`;
            statusClass = 'status-warning';
          }
        } else {
          statusText += ' • ⚠️ Node offline';
          statusClass = 'status-warning';
        }
      }
      // Before status check, show nothing or "Loading..."
      else {
        statusText = 'Loading...';
        statusClass = 'status-text';
      }
      
      statusEl.textContent = statusText;
      statusEl.className = statusClass;
    }

    // Show/hide create wallet card - only after status checked
    const createCard = document.getElementById('createWalletCard');
    if (createCard) {
      // Only show if we've successfully checked status AND confirmed no wallet AND node is online
      if (wallet.statusChecked && !wallet.walletExists && wallet.rpcConnected) {
        createCard.style.display = 'block';
      } else {
        createCard.style.display = 'none';
      }
    }

    // Update Send button state (disable if RPC offline)
    const sendBtn = document.querySelector('button[onclick="app.goToSend()"]');
    if (sendBtn) {
      if (!wallet.rpcConnected) {
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        sendBtn.style.cursor = 'not-allowed';
      } else {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
      }
    }

    // Update balance
    const balanceEl = document.getElementById('balance');
    if (balanceEl) {
      balanceEl.textContent = wallet.formatBalance(this.currentUnit);
    }

    // Update address
    const addressEl = document.getElementById('address');
    if (addressEl) {
      if (wallet.address) {
        addressEl.textContent = wallet.address;
      } else {
        addressEl.textContent = '---';
      }
    }

    // Update last update time - show helpful message based on status
    const updateEl = document.getElementById('lastUpdate');
    const updateTextEl = document.getElementById('lastUpdateText');
    if (updateEl && updateTextEl) {
      if (wallet.isFetchingBalance) {
        // Currently fetching - show scanning message
        updateTextEl.textContent = 'Scanning chain for balance info...';
        updateEl.style.display = 'block';
      } else if (wallet.balanceFetched && wallet.lastUpdate) {
        // Show last update time when balance successfully fetched
        const timeAgo = wallet.getTimeSinceUpdate();
        const blockText = wallet.blockHeight ? ` (block ${wallet.blockHeight})` : '';
        updateTextEl.textContent = `Updated ${timeAgo}${blockText}`;
        updateEl.style.display = 'block';
      } else if (!wallet.rpcConnected) {
        updateTextEl.textContent = 'Balance unavailable - Node offline';
        updateEl.style.display = 'block';
      } else if (!wallet.walletExists) {
        updateTextEl.textContent = 'Create wallet to see balance';
        updateEl.style.display = 'block';
      } else {
        // Default: wallet exists and node connected - show scanning state
        updateTextEl.textContent = 'Scanning chain for balance info...';
        updateEl.style.display = 'block';
      }
    }
    
    // Update pruned chain warning (at the very end)
    this.updatePrunedWarning();
  }

  /**
   * Update pruned chain warning banner
   */
  updatePrunedWarning() {
    const warningEl = document.getElementById('prunedWarning');
    const detailsEl = document.getElementById('prunedWarningDetails');
    if (!warningEl) return;
    
    const result = wallet.checkPrunedWarning();
    
    if (result.isPruned) {
      // Show warning
      warningEl.style.display = 'flex';
      
      // Update detail dates if available
      if (result.createdDate) {
        const createdEl = document.getElementById('walletCreatedDate');
        if (createdEl) {
          createdEl.textContent = result.createdDate.toLocaleDateString() + ' ' + 
                                   result.createdDate.toLocaleTimeString();
        }
      }
      
      if (result.firstBlockDate) {
        const firstBlockEl = document.getElementById('firstBlockDate');
        if (firstBlockEl) {
          firstBlockEl.textContent = result.firstBlockDate.toLocaleDateString() + ' ' + 
                                       result.firstBlockDate.toLocaleTimeString();
        }
      }
    } else {
      // Hide warning and details
      warningEl.style.display = 'none';
      if (detailsEl) {
        detailsEl.style.display = 'none';
      }
    }
  }

  /**
   * Toggle pruned warning details visibility
   */
  togglePrunedWarningDetails() {
    const detailsEl = document.getElementById('prunedWarningDetails');
    
    if (!detailsEl) return;
    
    if (detailsEl.style.display === 'none' || !detailsEl.style.display) {
      detailsEl.style.display = 'block';
    } else {
      detailsEl.style.display = 'none';
    }
  }

  /**
   * Start timer to update balance label every minute
   */
  startUpdateTimer() {
    // Clear existing timer if any
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    // Update every minute (60000 ms)
    this.updateTimer = setInterval(() => {
      console.log('[App] Timer: Updating balance label');
      this.updateDashboard();
    }, 60000);
    
    console.log('[App] Update timer started (1 minute interval)');
  }

  /**
   * Stop update timer
   */
  stopUpdateTimer() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
      console.log('[App] Update timer stopped');
    }
  }

  /**
   * Update sync status message
   */
  /**
   * Update debug info
   */
  updateDebugInfo() {
    const debugEl = document.getElementById('debugInfo');
    if (debugEl) {
      const info = [
        `Token: ${api.accessToken ? api.accessToken.substring(0, 30) + '...' : 'NOT SET'}`,
        `Wallet exists: ${wallet.walletExists}`,
        `RPC connected: ${wallet.rpcConnected}`,
        `Address: ${wallet.address || 'none'}`,
        `Balance: ${wallet.balance !== null ? wallet.balance : 'null'}`,
        `Balance fetched: ${wallet.balanceFetched}`,
        `Last update: ${wallet.lastUpdate ? new Date(wallet.lastUpdate).toLocaleString() : 'never'}`
      ];
      debugEl.textContent = info.join('\n');
    }
  }

  /**
   * Show pairing view
   */
  showPairing() {
    this.currentView = 'pairing';
    document.getElementById('loadingView').style.display = 'none';
    document.getElementById('pairingView').style.display = 'block';
    document.getElementById('dashboardView').style.display = 'none';
  }

  /**
   * Show dashboard view
   */
  showDashboard() {
    this.currentView = 'dashboard';
    document.getElementById('loadingView').style.display = 'none';
    document.getElementById('pairingView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
    this.updateDashboard();
    this.updateDebugInfo(); // Populate debug info when showing dashboard
  }

  /**
   * Show message in pairing view
   */
  showMessage(message, type = 'info') {
    const resultDiv = document.getElementById('pairingResult');
    if (resultDiv) {
      // Preserve line breaks and make message readable
      const formattedMessage = message.replace(/\n/g, '<br>');
      resultDiv.innerHTML = `<div class="${type} result">${formattedMessage}</div>`;
    }
  }

  /**
   * Show error
   */
  showError(message) {
    alert(`Error: ${message}`);
  }

  /**
   * Navigate to send page
   */
  goToSend() {
    // Check if RPC is connected before allowing send
    if (!wallet.rpcConnected) {
      alert('Cannot send: Node not available. Please wait for node to connect.');
      return;
    }
    window.location.href = '/send.html';
  }

  /**
   * Show create wallet modal
   */
  async createWallet() {
    const password = prompt('Enter password for new wallet:\n\n(This password will be required for sending transactions)');
    
    if (!password) {
      return; // User cancelled
    }
    
    if (password.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    try {
      const result = await api.createWallet(password);
      console.log('[App] Wallet created:', result);
      
      // Update wallet state
      wallet.walletExists = true;
      wallet.address = result.address;
      
      // Sync to get balance
      await this.syncWallet();
      
      alert('✓ Wallet created successfully!\n\nAddress: ' + result.address);
    } catch (error) {
      console.error('[App] Wallet creation failed:', error);
      alert('Failed to create wallet: ' + error.message);
    }
  }

  /**
   * Show QR code for address
   */
  showAddressQR() {
    if (!wallet.address) {
      alert('No address available');
      return;
    }

    // Generate QR code
    const qrDiv = document.getElementById('addressQR');
    if (qrDiv) {
      qrDiv.innerHTML = '';
      new QRCode(qrDiv, {
        text: wallet.address,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff'
      });
      // Display address text using existing style
      document.getElementById('addressTextModal').textContent = wallet.address;
        // Show modal
      document.getElementById('qrModal').style.display = 'flex';
    }
  }

  /**
   * Close QR modal
   */
  closeQRModal() {
    document.getElementById('qrModal').style.display = 'none';
  }

  /**
   * Copy address to clipboard
   */
  async copyAddress() {
    const success = await wallet.copyAddress();
    if (success) {
      // Show feedback by changing icon color temporarily
      const btn = document.getElementById('copyBtn');
      if (btn) {
        const originalColor = btn.style.stroke;
        btn.style.stroke = '#4CAF50'; // Green feedback
        setTimeout(() => {
          btn.style.stroke = originalColor;
        }, 2000);
      }
    } else {
      alert('Failed to copy address');
    }
  }

  /**
   * Show settings modal
   */
  showSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      // Set the correct radio button based on current unit
      const radios = modal.querySelectorAll('input[name="displayUnit"]');
      radios.forEach(radio => {
        radio.checked = (radio.value === this.currentUnit);
      });
      
      modal.style.display = 'flex';
    }
  }

  /**
   * Close settings modal
   */
  closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Set display unit
   * @param {string} unit - Display unit ('BTC', 'μBTC', or 'sat')
   */
  async setUnit(unit) {
    if (!['BTC', 'μBTC', 'sat'].includes(unit)) {
      console.error('[App] Invalid unit:', unit);
      return;
    }
    
    this.currentUnit = unit;
    await storage.saveSetting('displayUnit', unit);
    console.log('[App] Display unit changed to:', unit);
    
    // Update all displays
    this.updateDashboard();
  }

  /**
   * Unpair device
   */
  async unpairDevice() {
    if (!confirm('Unpair this device? You will need to scan the QR code again.')) {
      return;
    }

    await storage.clearAll();
    this.paired = false;
    api.setTokens(null, null);
    
    // Reset wallet
    wallet.address = null;
    wallet.balance = null;
    wallet.walletExists = false;

    // Close settings modal
    this.closeSettingsModal();

    this.showPairing();
  }

  /**
   * Logout / unpair device (legacy method - calls unpairDevice)
   */
  async logout() {
    await this.unpairDevice();
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    // Set message and type
    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'success' || type === 'error') {
      toast.classList.add(type);
    }

    // Show toast
    toast.style.display = 'block';

    // Hide after duration
    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => {
        toast.style.display = 'none';
        toast.classList.remove('hiding');
      }, 300);
    }, duration);
  }

  /**
   * Show token renewal modal
   */
  showTokenRenewalModal() {
    const modal = document.getElementById('tokenRenewalModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  /**
   * Close token renewal modal
   */
  closeTokenRenewalModal() {
    const modal = document.getElementById('tokenRenewalModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * Renew access token
   */
  async renewAccessToken() {
    try {
      console.log('[App] Attempting to refresh access token...');
      const tokens = await storage.getTokens();
      
      if (!tokens || !tokens.refreshToken) {
        this.showToast('No refresh token available. Please re-pair.', 'error');
        this.closeTokenRenewalModal();
        setTimeout(() => this.unpairDevice(), 2000);
        return;
      }

      // Call refresh endpoint
      const result = await api.refreshAccessToken();
      
      // Save new access token
      await storage.saveTokens(result.access_token, tokens.refreshToken);
      api.setTokens(result.access_token, tokens.refreshToken);
      
      console.log('[App] Access token refreshed successfully');
      this.showToast('\u2713 Token renewed successfully', 'success');
      this.closeTokenRenewalModal();
      
      // Refresh the current view
      if (this.currentView === 'dashboard') {
        await this.syncWalletStatus();
      }
    } catch (error) {
      console.error('[App] Token renewal failed:', error);
      this.showToast('\u2717 Token renewal failed. Please re-pair.', 'error');
      this.closeTokenRenewalModal();
      
      // If refresh token is also invalid, unpair
      setTimeout(() => this.unpairDevice(), 2000);
    }
  }
}

// Initialize app when DOM is ready
let app;

document.addEventListener('DOMContentLoaded', () => {
  app = new WalletApp();
  app.init();
});
