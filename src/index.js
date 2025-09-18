import './main.scss';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './game/constants';
import Pipe from './game/pipe';
import Bird from './game/bird';
import Floor from './game/floor';
import Text from './game/gameText';
import Button from './game/gameButton';
import P5 from 'p5';
import Images from './assets/sprite.png';
import BackgroundImage from './assets/background.png';
import font from './assets/FlappyBirdy.ttf';
import Storage from './storage';

// === SOUND ===
import wingSound from "./assets/sounds/wing.ogg";
import pointSound from "./assets/sounds/point.ogg";
import hitSound from "./assets/sounds/hit.ogg";
import dieSound from "./assets/sounds/die.ogg";

export const wingAudio = new Audio(wingSound);
export const pointAudio = new Audio(pointSound);
export const hitAudio = new Audio(hitSound);
export const dieAudio = new Audio(dieSound);

// === WEB3 ===
import { ethers } from 'ethers';

// --- Helios Testnet Config ---
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;

// Contract config
const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e';
const CONTRACT_ABI = [
    "function submitPoints(uint256 _points) external",
    "function redeem() external",
    "function playerPoints(address) external view returns (uint256)",
    "function getRewardPreview(address) external view returns (uint256)"
];

let provider, signer, contract;
let isWalletConnected = false;
let playerPoints = 0;
let playerAddress = null;
let rewardPreview = 0;

// DOM elements
let connectToggle, pointsBadge, rewardBadge, claimToggle;

// === HELPERS ===
const getPointsNumber = (val) => {
    if (!val) return 0;
    if (typeof val.toNumber === 'function') {
        try { return val.toNumber(); } catch { return Number(val) || 0; }
    }
    return Number(val) || 0;
};

const formatRewardPreview = (val) => {
    try {
        if (!val) return '0.00';
        return Number(ethers.utils.formatEther(val)).toFixed(2);
    } catch {
        try { return (Number(val) / 1e18).toFixed(2); } catch { return '0.00'; }
    }
};

// === WEB3 FUNCTIONS ===
const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ethers.utils.hexValue(HELIOS_CHAIN_ID) }]
            }).catch(async (err) => {
                if (err.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: ethers.utils.hexValue(HELIOS_CHAIN_ID),
                            chainName: 'Helios Testnet',
                            nativeCurrency: { name: 'Helios', symbol: 'HLS', decimals: 18 },
                            rpcUrls: [HELIOS_RPC],
                            blockExplorerUrls: ['https://explorer.helioschainlabs.org']
                        }]
                    });
                } else { throw err; }
            });

            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.JsonRpcProvider(HELIOS_RPC);
            signer = provider.getSigner();
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            playerAddress = await signer.getAddress();
            isWalletConnected = true;

            try { playerPoints = await contract.playerPoints(playerAddress); }
            catch { playerPoints = ethers.BigNumber.from(0); }
            try { rewardPreview = await contract.getRewardPreview(playerAddress); }
            catch { rewardPreview = ethers.BigNumber.from(0); }

            toggleWeb3UI();
        } catch (error) {
            console.error(error);
            alert('Failed to connect: ' + (error.message || error));
        }
    } else {
        alert('Install MetaMask!');
    }
};

const submitScoreToBlockchain = async (score) => {
    if (!isWalletConnected || !contract) return;
    try {
        const tx = await contract.submitPoints(score, { gasLimit: 300000 });
        await tx.wait();
        try { playerPoints = await contract.playerPoints(playerAddress); }
        catch { playerPoints = ethers.BigNumber.from(0); }
        try { rewardPreview = await contract.getRewardPreview(playerAddress); }
        catch { rewardPreview = ethers.BigNumber.from(0); }
        toggleWeb3UI();
    } catch (error) {
        console.error(error);
    }
};

const redeemPoints = async () => {
    if (!isWalletConnected || !contract) return;
    const pts = getPointsNumber(playerPoints);
    if (pts === 0) return;
    try {
        const tx = await contract.redeem({ gasLimit: 300000 });
        await tx.wait();
        playerPoints = ethers.BigNumber.from(0);
        rewardPreview = ethers.BigNumber.from(0);
        toggleWeb3UI();
    } catch (error) {
        console.error(error);
    }
};

// === UI CREATION ===
const createUI = () => {
    // top bar
    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    document.body.appendChild(topBar);

    // connect
    connectToggle = document.createElement('button');
    connectToggle.className = 'toggle connect';
    connectToggle.innerText = '🔗 Connect';
    connectToggle.onclick = connectWallet;
    topBar.appendChild(connectToggle);

    // points
    pointsBadge = document.createElement('div');
    pointsBadge.className = 'badge points';
    pointsBadge.innerText = '⭐ 0';
    topBar.appendChild(pointsBadge);

    // reward
    rewardBadge = document.createElement('div');
    rewardBadge.className = 'badge reward';
    rewardBadge.innerText = '💎 0.00';
    topBar.appendChild(rewardBadge);

    // claim
    claimToggle = document.createElement('button');
    claimToggle.id = 'claim-reward';
    claimToggle.innerText = '⚡ Claim';
    claimToggle.onclick = redeemPoints;
    document.body.appendChild(claimToggle);
};

const toggleWeb3UI = () => {
    if (isWalletConnected) {
        connectToggle.innerText = playerAddress.slice(0, 6) + '...' + playerAddress.slice(-4);
        pointsBadge.innerText = '⭐ ' + getPointsNumber(playerPoints);
        rewardBadge.innerText = '💎 ' + formatRewardPreview(rewardPreview);
        claimToggle.disabled = getPointsNumber(playerPoints) === 0;
    } else {
        connectToggle.innerText = '🔗 Connect';
        pointsBadge.innerText = '⭐ 0';
        rewardBadge.innerText = '💎 0.00';
        claimToggle.disabled = true;
    }
};

// === STYLE INJECTION ===
const style = document.createElement('style');
style.innerHTML = `
#top-bar {
  position: fixed;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  z-index: 1000;
}
.toggle {
  height: 32px;
  padding: 0 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: bold;
}
.badge {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 12px;
  background: rgba(0,0,0,0.6);
  color: #fff;
}
#claim-reward {
  position: fixed;
  top: 60px;
  right: 10px;
  width: 110px;
  height: 32px;
  border-radius: 16px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: #000;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  z-index: 1001;
}
`;
document.head.appendChild(style);

// === GAME ===
const sketch = (p) => {
    let bird, floor, pipes = [], text;
    p.preload = () => { p.loadImage(Images); p.loadImage(BackgroundImage); p.loadFont(font); };
    p.setup = () => {
        p.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        bird = new Bird(p);
        floor = new Floor(p);
        text = new Text(p);
        createUI();
    };
    p.draw = () => {
        p.background(135, 206, 235);
        pipes.forEach(pipe => pipe.show());
        bird.update(); bird.show();
        floor.show();
        text.show();
    };
    p.keyPressed = () => { if (p.key === ' ') bird.up(); };
};
new P5(sketch);