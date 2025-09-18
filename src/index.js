// index.js (main)
import './main.scss';
import { CANVASHEIGHT, CANVASWIDTH } from './game/constants';
import Pipe from './game/pipe';
import Bird from './game/bird';
import Floor from './game/floor';
import Text from './game/gameText';       // will import default export (see gameText.js below)
import Button from './game/gameButton';
import P5 from 'p5';
import Images from './assets/sprite.png';
import BackgroundImage from './assets/background.png';
import font from './assets/FlappyBirdy.ttf';
import Storage from './storage';

// === IMPORT SOUND ===
import wingSound from "./assets/sounds/wing.ogg";
import pointSound from "./assets/sounds/point.ogg";
import hitSound from "./assets/sounds/hit.ogg";
import dieSound from "./assets/sounds/die.ogg";

export const wingAudio = new Audio(wingSound);
export const pointAudio = new Audio(pointSound);
export const hitAudio = new Audio(hitSound);
export const dieAudio = new Audio(dieSound);

// === WEB3 INTEGRATION ===
import { ethers } from 'ethers';

// --- NETWORK CONFIG ---
const NETWORK = {
  name: 'helios-testnet',  // ganti ke 'helios-mainnet' kalau sudah live / deploy ke mainnet
  rpc: NETWORK === 'helios-mainnet' 
         ? 'https://dataseed.helioschain.network' 
         : 'https://testnet1.helioschainlabs.org',
  chainId: NETWORK === 'helios-mainnet' 
             ? 4242 
             : 42000
};

// Contract config (kontrak distribusi token)
const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e';
const CONTRACT_ABI = [
    "function submitPoints(uint256 _points) external",
    "function redeem() external",
    "function playerPoints(address) external view returns (uint256)",
    "function getRewardPreview(address) external view returns (uint256)",
    "function getPoolBalance() external view returns (uint256)"
];

let provider, signer, contract;
let isWalletConnected = false;
let playerPoints = 0;
let playerAddress = null;
let rewardPreview = 0;

// DOM elements - Compact UI
let connectToggle, pointsBadge, rewardBadge, claimToggle;

// Helper: safely convert playerPoints (handle BigNumber)
const getPointsNumber = (val) => {
    if (val == null) return 0;
    if (typeof val.toNumber === 'function') {
        try { return val.toNumber(); } catch(e) { return Number(val) || 0; }
    }
    return Number(val) || 0;
};

// Helper: format rewardPreview (handle BigNumber via ethers util)
const formatRewardPreview = (val) => {
    try {
        if (!val) return '0.00';
        return Number(ethers.utils.formatEther(val)).toFixed(2);
    } catch (e) {
        try { return (Number(val) / 1e18).toFixed(2); } catch (e2) { return '0.00'; }
    }
};

// === WEB3 FUNCTIONS ===
const connectWallet = async () => {
    console.log('🔄 Starting wallet connection...');
    if (typeof window.ethereum !== 'undefined') {
        try {
            // request network change if needed
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ethers.utils.hexValue(NETWORK.chainId) }]
            }).catch((err) => {
                // jika network belum ditambahkan
                if (err.code === 4902) {
                    return window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: ethers.utils.hexValue(NETWORK.chainId),
                            chainName: NETWORK.name,
                            nativeCurrency: {
                                name: 'Helios',
                                symbol: 'HLS',
                                decimals: 18
                            },
                            rpcUrls: [NETWORK.rpc],
                            blockExplorerUrls: [ 'https://explorer.helioschainlabs.org' ]
                        }]
                    });
                } else {
                    throw err;
                }
            });

            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.JsonRpcProvider(NETWORK.rpc);
            signer = provider.getSigner();
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            playerAddress = await signer.getAddress();
            isWalletConnected = true;

            // fetch current on-chain points & preview
            try {
                playerPoints = await contract.playerPoints(playerAddress);
                rewardPreview = await contract.getRewardPreview(playerAddress);
            } catch (fetchError) {
                console.error('⚠️ Fetch error:', fetchError);
                playerPoints = ethers.BigNumber.from(0);
                rewardPreview = ethers.BigNumber.from(0);
            }

            toggleWeb3UI();
            animateConnectSuccess();

            window.ethereum.on('accountsChanged', () => window.location.reload());
            window.ethereum.on('chainChanged', () => window.location.reload());
        } catch (error) {
            console.error('❌ Connection error:', error);
            alert('Failed to connect wallet: ' + (error.message || error));
        }
    } else {
        alert('Please install MetaMask!');
    }
};

const submitScoreToBlockchain = async (score) => {
    if (!isWalletConnected || !contract) {
        showToast('Connect wallet first!', 'warning');
        return false;
    }
    try {
        console.log(`📤 Submitting score ${score}...`);
        showToast('Submitting score...', 'loading');
        const tx = await contract.submitPoints(score, { gasLimit: 300000 });
        await tx.wait();

        // refresh on-chain values
        playerPoints = await contract.playerPoints(playerAddress);
        rewardPreview = await contract.getRewardPreview(playerAddress);

        toggleWeb3UI();
        showToast(`+${score} points!`, 'success');
        animateScorePulse(pointsBadge, score);
        return true;
    } catch (error) {
        console.error('❌ Submit error:', error);
        let msg = 'Submit failed: ';
        if (error && error.code === 4001) msg += 'Cancelled';
        else if (error && error.message && error.message.includes('insufficient funds')) msg += 'Low ETH';
        else msg += error?.message || error;
        showToast(msg, 'error');
        return false;
    }
};

const redeemPoints = async () => {
    if (!isWalletConnected || !contract) {
        showToast('Connect wallet first!', 'warning');
        return;
    }
    const pts = getPointsNumber(playerPoints);
    if (pts === 0) {
        showToast('No points to claim!', 'warning');
        return;
    }
    try {
        showToast('Claiming tokens...', 'loading');
        const tx = await contract.redeem({ gasLimit: 300000 });
        await tx.wait();

        // assume contract behavior: convert points menjadi tokens
        const tokens = (pts / 10).toFixed(2);
        playerPoints = ethers.BigNumber.from(0);
        rewardPreview = ethers.BigNumber.from(0);

        toggleWeb3UI();
        showToast(`Claimed ${tokens} tokens! 🎉`, 'success');
        animateClaimSuccess();
    } catch (error) {
        console.error('❌ Redeem error:', error);
        let msg = 'Claim failed: ';
        if (error && error.message && error.message.includes('No points')) msg += 'No points';
        else if (error && error.code === 4001) msg += 'Cancelled';
        else msg += error?.message || error;
        showToast(msg, 'error');
    }
};

// Compact UI Toggle (updates DOM based on state)
const toggleWeb3UI = () => {
    if (connectToggle) {
        if (isWalletConnected && playerAddress) {
            const short = playerAddress.slice(0,6) + '...' + playerAddress.slice(-4);
            connectToggle.innerHTML = `✅ ${short}`;
            connectToggle.className = 'toggle connected';
        } else {
            connectToggle.innerHTML = '🔗 Connect';
            connectToggle.className = 'toggle';
        }
    }

    if (pointsBadge) {
        const pts = getPointsNumber(playerPoints);
        pointsBadge.innerHTML = pts.toString() || '0';
        pointsBadge.className = pts > 0 ? 'badge active' : 'badge';
    }

    if (rewardBadge) {
        const tokens = formatRewardPreview(rewardPreview);
        rewardBadge.innerHTML = `💎 ${tokens}`;
        rewardBadge.className = (Number(tokens) > 0) ? 'badge reward active' : 'badge reward';
    }

    if (claimToggle) {
        const pts = getPointsNumber(playerPoints);
        const canClaim = pts > 0;
        claimToggle.disabled = !canClaim;
        claimToggle.className = canClaim ? 'toggle claim active' : 'toggle claim disabled';
        claimToggle.innerHTML = canClaim ? '⚡ Claim' : '⚡ Locked';
        if (canClaim) {
            claimToggle.style.opacity = '1';
            claimToggle.style.transform = 'translateY(0)';
        } else {
            claimToggle.style.opacity = '0';
            claimToggle.style.transform = 'translateY(10px)';
        }
    }
};

// Compact UI Creation, Styles, Toast & Animations tetap sama seperti skrip kamu sebelumnya…

// … (rest of the script: UI, game loop, etc) …

new P5(sketch, 'Game');