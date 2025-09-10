// Private Age Verification DApp
// Contract Address: 0x9A963da94E929E49c2a102fab47418Dc3b82Ee6C

class PrivateAgeVerificationApp {
    constructor() {
        this.contractAddress = '0x9A963da94E929E49c2a102fab47418Dc3b82Ee6C';
        this.contractABI = [
            // Read functions
            'function owner() view returns (address)',
            'function totalVerifications() view returns (uint256)',
            'function isAuthorizedVerifier(address verifier) view returns (bool)',
            'function getUserVerificationStatus(address user) view returns (bool hasSubmittedAge, bool verificationCompleted, uint256 timestamp)',
            'function getVerificationStats() view returns (uint256 totalUsers, uint256 completedVerifications, uint256 pendingCount)',
            'function isUserAdult(address user) view returns (bool completed, bool isAdult)',
            'function emergencyPaused() view returns (bool)',

            // Write functions
            'function submitEncryptedAge(uint8 _age)',
            'function getVerificationResult() view returns (bytes32)',
            'function verifyAgeRange(uint8 minAge, uint8 maxAge) returns (bytes32)',
            'function compareAges(address otherUser) returns (bytes32)',
            'function completeVerificationForUser(address user, bool isAdult)',

            // Events
            'event AgeSubmitted(address indexed user, uint256 timestamp)',
            'event VerificationCompleted(address indexed user, bool isAdult, uint256 timestamp)',
            'event AgeVerificationRequested(address indexed user, uint256 timestamp)'
        ];

        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.userAddress = null;
        this.transactions = [];

        this.init();
    }

    async init() {
        // Wait for ethers.js to load
        await this.waitForEthers();
        this.setupEventListeners();
        await this.checkConnection();
        this.updateUI();
    }

    async waitForEthers() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max wait

            const checkEthers = () => {
                if (typeof window.ethers !== 'undefined') {
                    console.log('Ethers.js is ready');
                    resolve();
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(checkEthers, 100);
                } else {
                    console.error('Ethers.js failed to load after 5 seconds');
                    this.showToast('Failed to load required libraries. Please refresh the page.', 'error');
                    reject(new Error('Ethers.js not loaded'));
                }
            };

            checkEthers();
        });
    }

    setupEventListeners() {
        // Connection
        document.getElementById('connectBtn').addEventListener('click', () => this.connectWallet());

        // Age submission
        document.getElementById('submitAgeBtn').addEventListener('click', () => this.submitAge());
        document.getElementById('ageInput').addEventListener('input', () => this.validateAgeInput());

        // Verification
        document.getElementById('getVerificationBtn').addEventListener('click', () => this.getVerificationResult());
        document.getElementById('checkAdultStatusBtn').addEventListener('click', () => this.checkAdultStatus());

        // Advanced features
        document.getElementById('verifyRangeBtn').addEventListener('click', () => this.verifyAgeRange());
        document.getElementById('compareAgeBtn').addEventListener('click', () => this.compareAges());

        // Statistics
        document.getElementById('refreshStatsBtn').addEventListener('click', () => this.refreshStats());

        // Input validation
        document.getElementById('minAge').addEventListener('input', () => this.validateRangeInputs());
        document.getElementById('maxAge').addEventListener('input', () => this.validateRangeInputs());
        document.getElementById('compareAddress').addEventListener('input', () => this.validateAddressInput());
    }

    async checkConnection() {
        if (typeof window.ethereum !== 'undefined') {
            try {
                this.provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });

                if (accounts.length > 0) {
                    await this.connectWallet();
                }
            } catch (error) {
                console.error('Error checking connection:', error);
            }
        }
    }

    async connectWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                this.showToast('MetaMask not detected! Please install MetaMask browser extension to continue.', 'error');
                window.open('https://metamask.io/download/', '_blank');
                return;
            }

            this.showLoading('Connecting to MetaMask...');

            // Request account access
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

            if (accounts.length === 0) {
                throw new Error('No accounts found. Please unlock MetaMask.');
            }

            this.provider = new ethers.BrowserProvider(window.ethereum);
            this.signer = await this.provider.getSigner();
            this.userAddress = await this.signer.getAddress();

            // Check and switch network
            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);

            if (chainId !== 11155111) { // Sepolia testnet
                this.showLoading('Switching to Sepolia testnet...');
                await this.switchToSepolia();

                // Refresh provider after network switch
                this.provider = new ethers.BrowserProvider(window.ethereum);
                this.signer = await this.provider.getSigner();
            }

            // Initialize contract
            this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);

            // Verify contract exists and is deployed
            await this.verifyContract();

            this.hideLoading();
            this.updateUI();

            // Load initial data
            try {
                await Promise.all([
                    this.refreshStats(),
                    this.loadUserStatus()
                ]);
            } catch (error) {
                console.warn('Initial data loading failed:', error.message);
                // Continue anyway, might be first time use
            }

            this.showToast('Successfully connected to Sepolia testnet! ✅', 'success');

        } catch (error) {
            this.hideLoading();
            console.error('Wallet connection error:', error);

            let errorMessage = 'Failed to connect wallet';
            if (error.code === 4001) {
                errorMessage = 'Connection rejected by user';
            } else if (error.code === -32002) {
                errorMessage = 'MetaMask is already processing a request. Please check MetaMask.';
            } else if (error.message) {
                errorMessage = error.message;
            }

            this.showToast(errorMessage, 'error');
        }
    }

    async switchToSepolia() {
        try {
            // First try to switch to Sepolia
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: '0xaa36a7' }], // Sepolia testnet
            });
        } catch (switchError) {
            // If the network doesn't exist, add it
            if (switchError.code === 4902 || switchError.code === -32603) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0xaa36a7',
                            chainName: 'Sepolia Test Network',
                            nativeCurrency: {
                                name: 'Sepolia ETH',
                                symbol: 'ETH',
                                decimals: 18
                            },
                            rpcUrls: ['https://sepolia.infura.io/v3/'],
                            blockExplorerUrls: ['https://sepolia.etherscan.io/']
                        }]
                    });
                } catch (addError) {
                    throw new Error('Failed to add Sepolia network to MetaMask. Please add it manually.');
                }
            } else if (switchError.code === 4001) {
                throw new Error('Network switch rejected by user');
            } else {
                throw new Error('Failed to switch to Sepolia network: ' + switchError.message);
            }
        }
    }

    async verifyContract() {
        try {
            // Check if contract exists at address
            const code = await this.provider.getCode(this.contractAddress);

            if (code === '0x') {
                throw new Error(`No contract found at address ${this.contractAddress}. Please check if the contract is deployed correctly.`);
            }

            console.log('Contract verified at address:', this.contractAddress);

            // Try to call a simple view function to test ABI compatibility
            try {
                await this.contract.owner();
                console.log('Contract ABI is compatible');
            } catch (error) {
                console.warn('Contract ABI might not be compatible:', error.message);
                // Don't throw here, some contracts might not have owner() function
            }

        } catch (error) {
            console.error('Contract verification failed:', error);
            this.showContractWarning();
            this.showToast('Contract verification failed: ' + error.message, 'error');
            throw error;
        }
    }

    showContractWarning() {
        const warningSection = document.getElementById('contractWarning');
        const expectedAddress = document.getElementById('expectedContractAddress');

        if (expectedAddress) {
            expectedAddress.textContent = this.contractAddress;
        }

        if (warningSection) {
            warningSection.style.display = 'block';
        }

        // Hide other sections that require contract interaction
        const sectionsToHide = [
            'userStatusCard'
        ];

        sectionsToHide.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
            }
        });

        // Disable buttons that require contract interaction
        const buttonsToDisable = [
            'submitAgeBtn', 'getVerificationBtn', 'checkAdultStatusBtn',
            'verifyRangeBtn', 'compareAgeBtn'
        ];

        buttonsToDisable.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.disabled = true;
                button.title = 'Contract not deployed';
            }
        });
    }

    async submitAge() {
        try {
            const age = parseInt(document.getElementById('ageInput').value);

            if (!age || age < 1 || age > 120) {
                this.showToast('Please enter a valid age between 1 and 120', 'error');
                return;
            }

            if (!this.contract) {
                this.showToast('Please connect your wallet first', 'error');
                return;
            }

            this.showLoading('Submitting encrypted age...');
            this.setButtonLoading('submitAgeBtn', true);

            const tx = await this.contract.submitEncryptedAge(age);
            this.addTransaction(tx.hash, 'Age Submission', 'pending');

            const receipt = await tx.wait();

            this.hideLoading();
            this.setButtonLoading('submitAgeBtn', false);
            this.updateTransaction(tx.hash, 'success');

            this.showMessage('ageSubmissionStatus', 'Age submitted successfully! Your age has been encrypted and stored securely on the blockchain.', 'success');

            await this.loadUserStatus();
            await this.refreshStats();

            document.getElementById('ageInput').value = '';

        } catch (error) {
            this.hideLoading();
            this.setButtonLoading('submitAgeBtn', false);
            console.error('Submit age error:', error);
            this.showMessage('ageSubmissionStatus', 'Error submitting age: ' + error.message, 'error');
        }
    }

    async getVerificationResult() {
        try {
            if (!this.contract) {
                this.showToast('Please connect your wallet first', 'error');
                return;
            }

            this.showLoading('Getting verification result...');

            const result = await this.contract.getVerificationResult();

            this.hideLoading();

            this.showMessage('verificationResult',
                `Encrypted verification result: ${result}\\n\\nThis encrypted value represents your age verification status. Only authorized parties can decrypt this result to determine if you are 18+ years old.`,
                'info');

        } catch (error) {
            this.hideLoading();
            console.error('Get verification error:', error);
            this.showMessage('verificationResult', 'Error getting verification result: ' + error.message, 'error');
        }
    }

    async checkAdultStatus() {
        try {
            if (!this.contract) {
                this.showToast('Please connect your wallet first', 'error');
                return;
            }

            this.showLoading('Checking adult status...');

            const [completed, isAdult] = await this.contract.isUserAdult(this.userAddress);

            this.hideLoading();

            if (completed) {
                this.showMessage('verificationResult',
                    `Verification Status: ${isAdult ? 'Verified Adult (18+ years old)' : 'Verified Minor (Under 18 years old)'}`,
                    isAdult ? 'success' : 'info');
            } else {
                this.showMessage('verificationResult',
                    'Age verification not completed yet. Please submit your age first and complete the verification process.',
                    'info');
            }

        } catch (error) {
            this.hideLoading();
            console.error('Check adult status error:', error);
            this.showMessage('verificationResult', 'Error checking adult status: ' + error.message, 'error');
        }
    }

    async verifyAgeRange() {
        try {
            const minAge = parseInt(document.getElementById('minAge').value);
            const maxAge = parseInt(document.getElementById('maxAge').value);

            if (!minAge || !maxAge || minAge < 1 || maxAge > 120 || minAge > maxAge) {
                this.showToast('Please enter valid age range (1-120, min ≤ max)', 'error');
                return;
            }

            if (!this.contract) {
                this.showToast('Please connect your wallet first', 'error');
                return;
            }

            this.showLoading('Verifying age range...');

            const result = await this.contract.verifyAgeRange(minAge, maxAge);
            const receipt = await result.wait();

            this.hideLoading();

            this.showMessage('advancedResult',
                `Age range verification completed successfully!\\nVerified range: ${minAge}-${maxAge} years old\\nTransaction hash: ${receipt.hash}\\n\\nThe encrypted result indicates whether your age falls within the specified range.`,
                'success');

        } catch (error) {
            this.hideLoading();
            console.error('Verify age range error:', error);
            this.showMessage('advancedResult', 'Error verifying age range: ' + error.message, 'error');
        }
    }

    async compareAges() {
        try {
            const otherAddress = document.getElementById('compareAddress').value.trim();

            if (!this.isValidAddress(otherAddress)) {
                this.showToast('Please enter a valid Ethereum address', 'error');
                return;
            }

            if (!this.contract) {
                this.showToast('Please connect your wallet first', 'error');
                return;
            }

            this.showLoading('Comparing ages...');

            const result = await this.contract.compareAges(otherAddress);
            const receipt = await result.wait();

            this.hideLoading();

            this.showMessage('advancedResult',
                `Age comparison completed successfully!\\nCompared with: ${this.formatAddress(otherAddress)}\\nTransaction hash: ${receipt.hash}\\n\\nThe encrypted result shows whether you are older than the other user (privacy-preserving comparison).`,
                'success');

        } catch (error) {
            this.hideLoading();
            console.error('Compare ages error:', error);
            this.showMessage('advancedResult', 'Error comparing ages: ' + error.message, 'error');
        }
    }

    async refreshStats() {
        try {
            if (!this.contract) return;

            const [totalUsers, completedVerifications, pendingCount] = await this.contract.getVerificationStats();

            document.getElementById('totalUsers').textContent = totalUsers.toString();
            document.getElementById('completedVerifications').textContent = completedVerifications.toString();
            document.getElementById('pendingVerifications').textContent = pendingCount.toString();

        } catch (error) {
            console.error('Error refreshing stats:', error);
            // Set default values instead of showing errors
            document.getElementById('totalUsers').textContent = '0';
            document.getElementById('completedVerifications').textContent = '0';
            document.getElementById('pendingVerifications').textContent = '0';
        }
    }

    async loadUserStatus() {
        try {
            if (!this.contract || !this.userAddress) return;

            const [hasSubmitted, completed, timestamp] = await this.contract.getUserVerificationStatus(this.userAddress);

            document.getElementById('hasSubmittedAge').textContent = hasSubmitted ? 'Yes' : 'No';
            document.getElementById('verificationCompleted').textContent = completed ? 'Yes' : 'No';
            document.getElementById('submissionTime').textContent = timestamp > 0
                ? new Date(Number(timestamp) * 1000).toLocaleString()
                : '-';

            document.getElementById('userStatusCard').style.display = 'block';

        } catch (error) {
            console.error('Error loading user status:', error);
            // Set default values
            document.getElementById('hasSubmittedAge').textContent = 'No';
            document.getElementById('verificationCompleted').textContent = 'No';
            document.getElementById('submissionTime').textContent = '-';
            document.getElementById('userStatusCard').style.display = 'block';
        }
    }

    validateAgeInput() {
        const age = parseInt(document.getElementById('ageInput').value);
        const submitBtn = document.getElementById('submitAgeBtn');

        if (age && age >= 1 && age <= 120 && this.contract) {
            submitBtn.disabled = false;
        } else {
            submitBtn.disabled = true;
        }
    }

    validateRangeInputs() {
        const minAge = parseInt(document.getElementById('minAge').value);
        const maxAge = parseInt(document.getElementById('maxAge').value);
        const verifyBtn = document.getElementById('verifyRangeBtn');

        if (minAge && maxAge && minAge >= 1 && maxAge <= 120 && minAge <= maxAge && this.contract) {
            verifyBtn.disabled = false;
        } else {
            verifyBtn.disabled = true;
        }
    }

    validateAddressInput() {
        const address = document.getElementById('compareAddress').value.trim();
        const compareBtn = document.getElementById('compareAgeBtn');

        if (this.isValidAddress(address) && this.contract) {
            compareBtn.disabled = false;
        } else {
            compareBtn.disabled = true;
        }
    }

    isValidAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    formatAddress(address) {
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    }

    updateUI() {
        const connected = !!this.userAddress;

        // Connection status
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const connectBtn = document.getElementById('connectBtn');
        const networkInfo = document.getElementById('networkInfo');

        if (connected) {
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Connected';
            connectBtn.textContent = 'Connected';
            connectBtn.disabled = true;
            networkInfo.style.display = 'block';

            document.getElementById('networkName').textContent = 'Sepolia Testnet';
            document.getElementById('userAddress').textContent = this.formatAddress(this.userAddress);
        } else {
            statusIndicator.classList.remove('connected');
            statusText.textContent = 'Not Connected';
            connectBtn.textContent = 'Connect Wallet';
            connectBtn.disabled = false;
            networkInfo.style.display = 'none';
        }

        // Enable/disable buttons based on connection
        const buttons = [
            'submitAgeBtn', 'getVerificationBtn', 'checkAdultStatusBtn',
            'verifyRangeBtn', 'compareAgeBtn'
        ];

        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (!connected) {
                button.disabled = true;
            }
        });

        // Validate inputs if connected
        if (connected) {
            this.validateAgeInput();
            this.validateRangeInputs();
            this.validateAddressInput();
        }
    }

    showLoading(text = 'Processing...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        loadingText.textContent = text;
        overlay.style.display = 'flex';
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = 'none';
    }

    setButtonLoading(buttonId, loading) {
        const button = document.getElementById(buttonId);
        const btnText = button.querySelector('.btn-text');
        const spinner = button.querySelector('.loading-spinner');

        if (loading) {
            button.disabled = true;
            if (btnText) btnText.style.display = 'none';
            if (spinner) spinner.style.display = 'block';
        } else {
            button.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (spinner) spinner.style.display = 'none';
        }
    }

    showMessage(elementId, message, type) {
        const element = document.getElementById(elementId);
        element.textContent = message;
        element.className = `${element.className.split(' ')[0]} ${type}`;
        element.style.display = 'block';

        setTimeout(() => {
            element.style.display = 'none';
        }, 8000);
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    addTransaction(hash, description, status) {
        this.transactions.unshift({ hash, description, status, timestamp: Date.now() });
        this.updateTransactionList();
    }

    updateTransaction(hash, status) {
        const tx = this.transactions.find(t => t.hash === hash);
        if (tx) {
            tx.status = status;
            this.updateTransactionList();
        }
    }

    updateTransactionList() {
        const list = document.getElementById('transactionList');

        if (this.transactions.length === 0) {
            list.innerHTML = '<p class="no-transactions">No transactions yet</p>';
            return;
        }

        list.innerHTML = this.transactions.slice(0, 5).map(tx => `
            <div class="transaction-item">
                <div>
                    <div class="transaction-hash">
                        <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank">
                            ${this.formatAddress(tx.hash)}
                        </a>
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">
                        ${tx.description} • ${new Date(tx.timestamp).toLocaleTimeString()}
                    </div>
                </div>
                <div class="transaction-status ${tx.status}">${tx.status}</div>
            </div>
        `).join('');
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PrivateAgeVerificationApp();
});

// Handle account/network changes
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            location.reload();
        } else {
            window.app?.connectWallet();
        }
    });

    window.ethereum.on('chainChanged', () => {
        location.reload();
    });
}