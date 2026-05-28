/**
 * wApp API Client
 * Handles all HTTP requests to the server
 */

class APIClient {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    this.baseURL = params.get('server') || window.location.origin;
    this.accessToken = null;
    this.refreshToken = null;
  }

  /**
   * Set authentication tokens
   */
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  /**
   * Make HTTP request
   */
  async request(method, endpoint, data = null, requiresAuth = true) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json'
    };

    if (requiresAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const options = {
      method,
      headers
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result = await response.json();

      if (!response.ok) {
        // Check for 401 Unauthorized errors
        if (response.status === 401 && requiresAuth) {
          console.log('[API] 401 Unauthorized - Access token may be expired');
          // Show token renewal modal if app instance exists
          if (typeof app !== 'undefined' && app.showTokenRenewalModal) {
            app.showTokenRenewalModal();
          }
        }
        throw new Error(result.error || `HTTP ${response.status}`);
      }

      return result;
    } catch (error) {
      console.error(`[API] ${method} ${endpoint} failed:`, error);
      throw error;
    }
  }

  // ========== Pairing Endpoints ==========

  /**
   * Request pairing (step 1)
   */
  async requestPairing(deviceName = 'Android Device') {
    return this.request('POST', '/pair/request', { device_name: deviceName }, false);
  }

  /**
   * Complete pairing (step 2)
   */
  async completePairing(pairingCode) {
    return this.request('POST', '/pair/complete', { pairing_code: pairingCode }, false);
  }

  /**
   * Complete pairing with session ID (single QR flow)
   */
  async completePairingWithSession(sessionId, deviceName = 'Android Device') {
    return this.request('POST', `/pair/${sessionId}`, { device_name: deviceName }, false);
  }

  // ========== Auth Endpoints ==========

  /**
   * Refresh access token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const result = await this.request('POST', '/auth/refresh', {
      refresh_token: this.refreshToken
    }, false);

    this.accessToken = result.access_token;
    return result;
  }

  /**
   * Renew refresh token (extend 90 days)
   */
  async renewRefreshToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    return this.request('POST', '/auth/renew', {
      refresh_token: this.refreshToken
    }, false);
  }

  // ========== Wallet Endpoints ==========

  /**
   * Get wallet status
   */
  async getWalletStatus() {
    return this.request('GET', '/api/wallet/status', null, false);
  }

  /**
   * Get wallet address
   */
  async getAddress() {
    return this.request('GET', '/api/wallet/address');
  }

  /**
   * Get wallet balance
   */
  async getBalance() {
    return this.request('GET', '/api/wallet/balance');
  }

  /**
   * Get wallet info (address, creation date, status)
   */
  async getWalletInfo() {
    return this.request('GET', '/api/wallet/info');
  }

  /**
   * Create new wallet
   */
  async createWallet(password) {
    return this.request('POST', '/api/wallet/create', { password });
  }

  /**
   * Send transaction
   */
  async sendTransaction(address, amountSats, password, feeRate = null) {
    // Security: Refuse to send password over HTTP (except localhost)
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      throw new Error('Insecure connection - refusing to send credentials over HTTP');
    }
    
    const payload = {
      to_address: address,
      amount_sat: amountSats,
      password
    };

    if (feeRate) {
      payload.fee_rate = feeRate;
    }

    // TEST MODE: Comment out for safety before sending real money
    //console.log('=== SEND TRANSACTION TEST ===');
    //console.log('Address:', address);
    //console.log('Amount (satoshis):', amountSats);
    //console.log('Payload:', payload);
    //console.log('============================');
    //return { success: true, txid: 'test-transaction-id' };
    
    return this.request('POST', '/api/wallet/send', payload);
  }

  /**
   * Get node status (block count, sync status)
   */
  async getNodeStatus() {
    return this.request('GET', '/api/wallet/node/status');
  }
}

// Export singleton instance
const api = new APIClient();
