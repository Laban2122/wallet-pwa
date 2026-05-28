/**
 * Send Page Logic
 * Handles Bitcoin transaction creation and sending
 */

class SendPage {
    constructor() {
        this.settings = null;
        this.currentUnit = 'μBTC'; // Default unit
        
        this.feeRate = 2;  // Current fee rate in sat/vB
        this.estimatedFeeInSats = 0;
        this.txSizeBytes = 209;  // Typical 2-in, 2-out P2WPKH transaction
        
        this.html5QrCode = null;  // QR code scanner instance
        this.lastTxId = null;  // Last successful transaction ID
        
        this.init();
    }

    async init() {
        try {
            // Initialize storage first
            await storage.init();
            
            // Load settings
            this.settings = await storage.getSettings();
            this.currentUnit = this.settings.displayUnit || 'μBTC';
            this.feeRate = this.settings.feeRate || 2;
            
            // Initialize UI
            this.initializeUI();
            
            // Wallet is already loaded in global instance
            
            console.log('Send page initialized, unit:', this.currentUnit);
        } catch (error) {
            console.error('Failed to initialize send page:', error);
            // Suppress error popup - functionality still works with defaults
            // Use default settings if load fails
            this.currentUnit = 'μBTC';
            this.feeRate = 2;
            this.initializeUI();
        }
    }

    initializeUI() {
        // Display current unit in label
        const unitLabel = document.getElementById('currentUnit');
        if (unitLabel) {
            unitLabel.textContent = this.currentUnit;
        }
        
        // Set fee rate slider to current setting
        const feeSlider = document.getElementById('feeRateSlider');
        if (feeSlider) {
            feeSlider.value = this.feeRate;
            document.getElementById('feeRateValue').textContent = this.feeRate.toFixed(1);
        }
        
        // Calculate initial fee
        this.updateCalculations();
    }

    // Navigation
    goBack() {
        window.location.href = '/';
    }

    goBackToDashboard() {
        // Don't trigger balance refresh - user can manually refresh if needed
        // Adding ?skipRefresh flag to prevent auto-update
        window.location.href = '/?skipRefresh=1';
    }

    // Address validation
    validateAddress() {
        const addressInput = document.getElementById('recipientAddress');
        const addressError = document.getElementById('addressError');
        const address = addressInput.value.trim();
        
        if (!address) {
            addressError.style.display = 'none';
            return false;
        }
        
        // Basic Bitcoin address validation
        const isValid = this.isValidBitcoinAddress(address);
        
        if (!isValid) {
            addressError.textContent = 'Invalid Bitcoin address';
            addressError.style.display = 'block';
            return false;
        }
        
        addressError.style.display = 'none';
        return true;
    }

    isValidBitcoinAddress(address) {
        // Bitcoin address patterns
        const patterns = [
            /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,  // P2PKH (1...) and P2SH (3...)
            /^bc1[a-z0-9]{39,87}$/i,  // Bech32 (bc1...)
            /^tb1[a-z0-9]{39,87}$/i   // Testnet Bech32 (tb1...)
        ];
        
        return patterns.some(pattern => pattern.test(address));
    }

    // Amount handling
    updateCalculations() {
        // Update fee rate display
        const feeSlider = document.getElementById('feeRateSlider');
        this.feeRate = parseFloat(feeSlider.value);
        document.getElementById('feeRateValue').textContent = this.feeRate.toFixed(1);
        
        // Check if we have a valid address before estimating fee
        const addressInput = document.getElementById('recipientAddress');
        const address = addressInput.value.trim();
        const hasValidAddress = address && this.isValidBitcoinAddress(address);
        
        // Calculate estimated fee locally (typical 2-in, 2-out P2WPKH = 209 vbytes)
        if (hasValidAddress) {
            this.estimatedFeeInSats = Math.ceil(this.feeRate * this.txSizeBytes);
        } else {
            this.estimatedFeeInSats = 0;
        }
        
        // Get amount input
        const amountInput = document.getElementById('amountInput');
        const amountValue = parseFloat(amountInput.value) || 0;
        
        // Show equivalent value in other units
        this.updateAmountEquivalent(amountValue);
        
        // Validate amount
        this.validateAmount(amountValue);
        
        // Update summary
        this.updateSummary(amountValue);
    }

    updateAmountEquivalent(amount) {
        const equivalentDiv = document.getElementById('amountEquivalent');
        
        if (amount <= 0) {
            equivalentDiv.textContent = '';
            return;
        }
        
        const currentUnit = this.currentUnit;
        
        // Convert to satoshis
        const sats = UnitConverter.displayToSat(amount, currentUnit);
        
        // Show in satoshis if not already in sat, otherwise show in BTC
        if (currentUnit === 'sat') {
            const btcAmount = UnitConverter.satToDisplay(sats, 'BTC');
            equivalentDiv.textContent = `≈ ${btcAmount.toFixed(8)} BTC`;
        } else {
            equivalentDiv.textContent = `≈ ${sats.toLocaleString()} sat`;
        }
    }

    validateAmount(amount) {
        const amountError = document.getElementById('amountError');
        
        if (amount <= 0) {
            amountError.style.display = 'none';
            return false;
        }
        
        const currentUnit = this.currentUnit;
        
        // Convert to satoshis
        const amountSats = UnitConverter.displayToSat(amount, currentUnit);
        
        // Check if we have a valid address for fee calculation
        const addressInput = document.getElementById('recipientAddress');
        const address = addressInput.value.trim();
        const hasValidAddress = address && this.isValidBitcoinAddress(address);
        
        // Only check balance with fee if we have a valid address (and thus a fee estimate)
        if (hasValidAddress) {
            const totalSats = amountSats + this.estimatedFeeInSats;
            
            if (wallet && wallet.balance && totalSats > wallet.balance) {
                amountError.textContent = 'Insufficient balance (including fee)';
                amountError.style.display = 'block';
                return false;
            }
        }
        
        // Check minimum amount (dust limit ~546 sats)
        if (amountSats < 546) {
            amountError.textContent = 'Amount too small (min 546 sat)';
            amountError.style.display = 'block';
            return false;
        }
        
        amountError.style.display = 'none';
        return true;
    }

    updateSummary(amount) {
        const summaryAmount = document.getElementById('summaryAmount');
        const summaryFee = document.getElementById('summaryFee');
        const summaryTotal = document.getElementById('summaryTotal');
        
        // Check if we have a valid address
        const addressInput = document.getElementById('recipientAddress');
        const address = addressInput.value.trim();
        const hasValidAddress = address && this.isValidBitcoinAddress(address);
        
        if (amount <= 0 || !hasValidAddress) {
            summaryAmount.textContent = '---';
            summaryFee.textContent = '---';
            summaryTotal.textContent = '---';
            return;
        }
        
        const currentUnit = this.currentUnit;
        
        // Convert amount to satoshis
        const amountSats = UnitConverter.displayToSat(amount, currentUnit);
        
        // Format amount in current unit
        summaryAmount.textContent = UnitConverter.formatAmount(amountSats, currentUnit);
        
        // Format fee in current unit
        summaryFee.textContent = UnitConverter.formatAmount(this.estimatedFeeInSats, currentUnit);
        
        // Calculate and format total
        const totalSats = amountSats + this.estimatedFeeInSats;
        summaryTotal.textContent = UnitConverter.formatAmount(totalSats, currentUnit);
    }

    formatAmountWithUnit(amount, unit) {
        if (unit === 'BTC') {
            return `${amount.toFixed(8)} BTC`;
        } else if (unit === 'mBTC') {
            return `${amount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} μBTC`;
        } else {  // sat
            return `${Math.floor(amount).toLocaleString()} sat`;
        }
    }

    formatAmountInUnit(btcAmount, unit) {
        if (unit === 'BTC') {
            return `${btcAmount.toFixed(8)} BTC`;
        } else if (unit === 'mBTC') {
            const mbtc = btcAmount * 1000000;
            return `${mbtc.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} μBTC`;
        } else {  // sat
            const sats = Math.floor(btcAmount * 100000000);
            return `${sats.toLocaleString()} sat`;
        }
    }

    updateSendButton() {
        // Only disable if address or amount is missing
        // Actual validation happens on click
        const sendButton = document.getElementById('sendButton');
        const addressInput = document.getElementById('recipientAddress');
        const amountInput = document.getElementById('amountInput');
        
        const hasAddress = addressInput.value.trim().length > 0;
        const hasAmount = parseFloat(amountInput.value) > 0;
        
        sendButton.disabled = !(hasAddress && hasAmount);
    }

    // QR Code Scanning
    showQROptions() {
        const modal = document.getElementById('qrOptionsModal');
        modal.style.display = 'flex';
    }

    closeQROptions() {
        const modal = document.getElementById('qrOptionsModal');
        modal.style.display = 'none';
    }

    async scanWithCamera() {
        this.closeQROptions();
        
        const modal = document.getElementById('qrScannerModal');
        modal.style.display = 'flex';
        
        try {
            this.html5QrCode = new Html5Qrcode("qrReader");
            
            await this.html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    this.handleQRScan(decodedText);
                    this.stopScanning();
                },
                (errorMessage) => {
                    // Ignore scan errors
                }
            );
        } catch (error) {
            console.error('Camera error:', error);
            this.stopScanning();
            alert('Failed to access camera. Please check permissions.');
        }
    }

    async scanFromGallery() {
        this.closeQROptions();
        
        try {
            // Create file input for image selection
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            
            fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                const html5QrCode = new Html5Qrcode("qrReader");
                
                try {
                    const decodedText = await html5QrCode.scanFile(file, true);
                    this.handleQRScan(decodedText);
                } catch (error) {
                    console.error('QR scan error:', error);
                    alert('No QR code found in image');
                }
            };
            
            fileInput.click();
        } catch (error) {
            console.error('Gallery error:', error);
            alert('Failed to open gallery');
        }
    }

    handleQRScan(decodedText) {
        console.log('QR scanned:', decodedText);
        
        // Parse Bitcoin URI (bitcoin:address?amount=...)
        if (decodedText.toLowerCase().startsWith('bitcoin:')) {
            const uri = this.parseBitcoinURI(decodedText);
            
            document.getElementById('recipientAddress').value = uri.address;
            
            if (uri.amount) {
                const currentUnit = this.currentUnit;
                // uri.amount is in BTC, convert to satoshis first
                const amountSats = Math.floor(uri.amount * 100000000);
                // Then convert to display unit
                const displayAmount = UnitConverter.satToDisplay(amountSats, currentUnit);
                const config = UnitConverter.getUnitConfig(currentUnit);
                document.getElementById('amountInput').value = displayAmount.toFixed(config.decimals);
            }
        } else {
            // Plain address
            document.getElementById('recipientAddress').value = decodedText;
        }
        
        this.validateAddress();
        this.updateCalculations();
    }

    parseBitcoinURI(uri) {
        // Parse bitcoin:address?amount=x&label=y
        const result = { address: '', amount: null };
        
        // Remove bitcoin: prefix
        let cleanURI = uri.replace(/^bitcoin:/i, '');
        
        // Split address and parameters
        const parts = cleanURI.split('?');
        result.address = parts[0];
        
        if (parts.length > 1) {
            const params = new URLSearchParams(parts[1]);
            if (params.has('amount')) {
                result.amount = parseFloat(params.get('amount'));
            }
        }
        
        return result;
    }

    stopScanning() {
        if (this.html5QrCode) {
            this.html5QrCode.stop().catch(() => {});
            this.html5QrCode = null;
        }
        
        const modal = document.getElementById('qrScannerModal');
        modal.style.display = 'none';
    }

    // Transaction sending
    initiateSend() {
        console.log('initiateSend called');
        
        // Get transaction details for display
        const address = document.getElementById('recipientAddress').value.trim();
        const amountValue = parseFloat(document.getElementById('amountInput').value);
        const amountSats = UnitConverter.displayToSat(amountValue, this.currentUnit);
        const displayAmount = UnitConverter.formatAmount(amountSats, this.currentUnit);
        
        // Populate sending summary in password modal
        const sendingSummary = document.getElementById('sendingSummary');
        sendingSummary.textContent = `Sending ${displayAmount} to ${address}`;
        
        // Show password modal directly - validation happens in confirmSend()
        const modal = document.getElementById('passwordModal');
        const passwordInput = document.getElementById('walletPassword');
        const passwordError = document.getElementById('passwordError');
        
        passwordInput.value = '';
        passwordError.style.display = 'none';
        modal.style.display = 'flex';
        
        // Focus password input
        setTimeout(() => passwordInput.focus(), 100);
    }

    closePasswordModal() {
        const modal = document.getElementById('passwordModal');
        modal.style.display = 'none';
    }

    togglePasswordVisibility() {
        const passwordInput = document.getElementById('walletPassword');
        passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    }

    updateLoadingMessage(message) {
        const loadingText = document.querySelector('.loading-overlay .loading-text');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    async confirmSend() {
        const passwordInput = document.getElementById('walletPassword');
        const passwordError = document.getElementById('passwordError');
        let password = passwordInput.value;
        
        if (!password) {
            passwordError.textContent = 'Password is required';
            passwordError.style.display = 'block';
            return;
        }
        
        // Get transaction details
        const address = document.getElementById('recipientAddress').value.trim();
        const amountValue = parseFloat(document.getElementById('amountInput').value);
        
        const currentUnit = this.currentUnit;
        
        // Convert amount to satoshis (integer)
        const amountSats = UnitConverter.displayToSat(amountValue, currentUnit);
        
        // Close password modal and clear input immediately
        this.closePasswordModal();
        passwordInput.value = '';
        
        // Show loading overlay with initial message
        const loadingOverlay = document.getElementById('loadingOverlay');
        loadingOverlay.style.display = 'flex';
        this.updateLoadingMessage('Scanning blockchain for available coins...');
        
        // Update message after 5 seconds to show it's still working
        const msgTimeout1 = setTimeout(() => {
            this.updateLoadingMessage('Still scanning... This may take up to 2 minutes');
        }, 5000);
        
        // After 30 seconds, indicate we're in the building phase
        const msgTimeout2 = setTimeout(() => {
            this.updateLoadingMessage('Building and signing transaction...');
        }, 30000);
        
        try {
            // Send transaction (API expects satoshis)
            // Note: The long wait here is the UTXO scan (scantxoutset), not the broadcast
            const response = await api.sendTransaction(
                address,
                amountSats,
                password,
                this.feeRate
            );
            
            // Clear timeouts
            clearTimeout(msgTimeout1);
            clearTimeout(msgTimeout2);
            
            // Show final phase
            this.updateLoadingMessage('Broadcasting to network...');
            
            // Security: Overwrite password in memory
            password = 'x'.repeat(20);
            password = null;
            
            // Brief delay to show broadcast message
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Hide loading
            loadingOverlay.style.display = 'none';
            
            if (response.txid) {
                this.lastTxId = response.txid;
                this.showSuccess(response.txid);
            } else {
                throw new Error(response.error || 'Transaction failed');
            }
            
        } catch (error) {
            console.error('Send error:', error);
            
            // Clear timeouts
            clearTimeout(msgTimeout1);
            clearTimeout(msgTimeout2);
            
            // Security: Overwrite password in memory
            password = 'x'.repeat(20);
            password = null;
            
            loadingOverlay.style.display = 'none';
            
            // Show error message
            this.showError(error.message || 'Failed to send transaction');
        }
    }

    showSuccess(txid) {
        const modal = document.getElementById('successModal');
        const txIdDisplay = document.getElementById('txIdDisplay');
        
        // Display truncated txid
        const truncated = txid.length > 16 
            ? `${txid.substring(0, 8)}...${txid.substring(txid.length - 8)}`
            : txid;
        
        txIdDisplay.textContent = truncated;
        txIdDisplay.title = txid;  // Full txid on hover
        
        modal.style.display = 'flex';
    }

    copyTxId() {
        if (this.lastTxId) {
            navigator.clipboard.writeText(this.lastTxId).then(() => {
                // Visual feedback
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = 'Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            });
        }
    }

    openExplorer() {
        if (this.lastTxId) {
            window.open(`https://mempool.space/tx/${this.lastTxId}?mode=details`, '_blank');
        }
    }

    showError(message) {
        alert(`Error: ${message}`);
    }
}

// Initialize when page loads
let sendPage;
document.addEventListener('DOMContentLoaded', () => {
    sendPage = new SendPage();
});
