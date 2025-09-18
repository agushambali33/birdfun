// index.js (main)
import './main.scss';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './game/constants';
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

// --- Helios Testnet Config ---
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;

// Contract config
const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e';
const CONTRACT_ABI = [
    "function submitPoints(uint256 _points) external",
    "function redeem() external",    // as before
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

// Helpers (BigNumber, formatting) tetep sama seperti sebelumnya

const getPointsNumber = (val) => {
    if (val == null) return 0;
    if (typeof val.toNumber === 'function') {
        try { return val.toNumber(); } catch(e) { return Number(val) || 0; }
    }
    return Number(val) || 0;
};

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
            // switch chain if needed
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ethers.utils.hexValue(HELIOS_CHAIN_ID) }]
            }).catch(async (err) => {
                if (err.code === 4902) {
                    // add chain if not added
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: ethers.utils.hexValue(HELIOS_CHAIN_ID),
                            chainName: 'Helios Testnet',
                            nativeCurrency: {
                                name: 'Helios',
                                symbol: 'HLS',
                                decimals: 18
                            },
                            rpcUrls: [HELIOS_RPC],
                            blockExplorerUrls: ['https://explorer.helioschainlabs.org']
                        }]
                    });
                } else {
                    throw err;
                }
            });

            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.JsonRpcProvider(HELIOS_RPC);
            signer = provider.getSigner();
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            playerAddress = await signer.getAddress();
            isWalletConnected = true;

            // fetch on-chain points & preview
            try {
                const ptsBN = await contract.playerPoints(playerAddress);
                playerPoints = ptsBN;
            } catch (fetchError) {
                console.warn('⚠️ playerPoints fetch error:', fetchError);
                playerPoints = ethers.BigNumber.from(0);
            }
            try {
                rewardPreview = await contract.getRewardPreview(playerAddress);
            } catch (errPreview) {
                console.warn('⚠️ getRewardPreview error:', errPreview);
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

        // refresh
        try {
            playerPoints = await contract.playerPoints(playerAddress);
        } catch (_) { playerPoints = ethers.BigNumber.from(0); }
        try {
            rewardPreview = await contract.getRewardPreview(playerAddress);
        } catch (_) { rewardPreview = ethers.BigNumber.from(0); }

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
        
        playerPoints = ethers.BigNumber.from(0);
        rewardPreview = ethers.BigNumber.from(0);

        toggleWeb3UI();
        showToast(`Claimed tokens! 🎉`, 'success');
        animateClaimSuccess();
    } catch (error) {
        console.error('❌ Redeem error:', error);
        let msg = 'Claim failed: ';
        if (error && error.code === 4001) msg += 'Cancelled';
        else msg += error?.message || error;
        showToast(msg, 'error');
    }
};

// UI toggle, createCompactUI, styles, animations, game loop semuanya sama saja tapi posisi Claim tombol sudah di kanan atas seperti design sebelumnya

// di bagian UI: dimana kamu bikin tombol Claim, ubah styling & posisinya seperti ini: