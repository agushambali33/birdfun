// index.js (FULL FINAL, non-blocking TX)
// Tetap gunakan asset & path sesuai project kamu
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
import fontFile from './assets/FlappyBirdy.ttf';
import Storage from './storage';

// sounds
import wingSound from "./assets/sounds/wing.ogg";
import pointSound from "./assets/sounds/point.ogg";
import hitSound from "./assets/sounds/hit.ogg";
import dieSound from "./assets/sounds/die.ogg";

export const wingAudio = new Audio(wingSound);
export const pointAudio = new Audio(pointSound);
export const hitAudio = new Audio(hitSound);
export const dieAudio = new Audio(dieSound);

// ethers
import { ethers } from 'ethers';

/* ====== CONFIG ====== */
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;
const HELIOS_CHAIN_ID_HEX = ethers.utils.hexValue(HELIOS_CHAIN_ID);

const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e';
const CONTRACT_ABI = [
  "function submitPoints(uint256 _points) external",
  "function redeem() external",
  "function playerPoints(address) external view returns (uint256)",
  "function getRewardPreview(address) external view returns (uint256)",
  "function getPoolBalance() external view returns (uint256)"
];

/* ====== PROVIDERS & CONTRACTS ====== */
const providerReadonly = new ethers.providers.JsonRpcProvider(HELIOS_RPC);

let provider = null;
let signer = null;
let contract = null;
let contractReadOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, providerReadonly);

/* ====== STATE ====== */
let isWalletConnected = false;
let playerAddress = null;
let playerPoints = ethers.BigNumber.from(0);
let rewardPreview = ethers.BigNumber.from(0);

/* ====== UI ELEMENTS ====== */
let topBar, connectToggle, pointsBadge, rewardBadge, claimToggle;

/* ====== HELPERS ====== */
const bnToNumberSafe = (bn) => {
  try {
    if (!bn) return 0;
    if (typeof bn.toNumber === 'function') return bn.toNumber();
    return Number(bn) || 0;
  } catch {
    try { return Number(bn.toString()); } catch { return 0; }
  }
};

const formatReward = (bn) => {
  try {
    if (!bn) return '0.00';
    return Number(ethers.utils.formatEther(bn)).toFixed(2);
  } catch {
    try { return (Number(bn) / 1e18).toFixed(2); } catch { return '0.00'; }
  }
};

/* ====== TOAST ====== */
const showToast = (msg, type = 'info') => {
  const existing = document.querySelector('.game-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `game-toast ${type}`;
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 2400);
};

/* ====== WEB3 ACTIONS ====== */
async function connectWallet(silent = false) {
  if (typeof window.ethereum === 'undefined') {
    if (!silent) showToast('Please install MetaMask!', 'error');
    return;
  }
  try {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: HELIOS_CHAIN_ID_HEX }]
      });
    } catch (switchErr) {
      if (switchErr && switchErr.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: HELIOS_CHAIN_ID_HEX,
            chainName: 'Helios Testnet',
            nativeCurrency: { name: 'Helios', symbol: 'HLS', decimals: 18 },
            rpcUrls: [HELIOS_RPC],
            blockExplorerUrls: ['https://explorer.helioschainlabs.org']
          }]
        });
      } else if (!silent) {
        throw switchErr;
      }
    }

    let accounts;
    if (silent) {
      accounts = await window.ethereum.request({ method: 'eth_accounts' });
    } else {
      accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    }

    if (accounts.length === 0) {
      if (!silent) showToast('No accounts found', 'error');
      return;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    signer = provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    playerAddress = accounts[0];
    isWalletConnected = !!playerAddress;

    try { playerPoints = await contract.playerPoints(playerAddress); } catch {}
    try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch {}

    toggleWeb3UI();
    if (!silent) showToast('Wallet connected', 'success');

    window.ethereum.on('accountsChanged', () => window.location.reload());
    window.ethereum.on('chainChanged', () => window.location.reload());
  } catch (err) {
    console.error('connectWallet error', err);
    if (!silent) showToast('Connect failed: ' + (err?.message || 'unknown'), 'error');
  }
}

async function autoConnectWallet() {
  await connectWallet(true);
}

function submitScoreToBlockchain(score) {
  if (!contract || !isWalletConnected) return;
  if (score <= 0) return;
  (async () => {
    try {
      showToast('Submitting score...', 'loading');
      const tx = await contract.submitPoints(score, { gasLimit: 300000 });
      tx.wait().then(async () => {
        try { playerPoints = await contract.playerPoints(playerAddress); } catch {}
        try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch {}
        toggleWeb3UI();
        showToast(`Score ${score} submitted`, 'success');
      }).catch(err => {
        console.error('submit wait error', err);
        showToast('Submit failed', 'error');
      });
    } catch (err) {
      console.error('submitScore error', err);
      showToast(err?.message || 'Submit failed', 'error');
    }
  })();
}

function redeemPoints() {
  if (!contract || !isWalletConnected) return;
  if (bnToNumberSafe(playerPoints) <= 0) {
    showToast('No points to claim', 'warning');
    return;
  }
  (async () => {
    try {
      showToast('Claiming...', 'loading');
      const tx = await contract.redeem({ gasLimit: 300000 });
      tx.wait().then(async () => {
        try { playerPoints = await contract.playerPoints(playerAddress); } catch {}
        try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch {}
        toggleWeb3UI();
        showToast('Claimed!', 'success');
      }).catch(err => {
        console.error('claim wait error', err);
        showToast('Claim failed', 'error');
      });
    } catch (err) {
      console.error('redeem error', err);
      showToast(err?.message || 'Claim failed', 'error');
    }
  })();
}

/* ====== UI ====== */
function injectStyles() {
  const s = document.createElement('style');
  s.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    #game-topbar { position: fixed; top: 10px; left: 10px; right: 10px; display: flex; gap: 8px; align-items: center; z-index: 9999; flex-wrap: wrap; }
    .g-toggle { height: 34px; padding: 0 12px; border-radius: 16px; border: none; background: linear-gradient(135deg,#6b7280,#111827); color: #fff; font-size: 12px; font-weight: 700; font-family: 'Press Start 2P', Arial, sans-serif; display: inline-flex; align-items: center; gap:8px; cursor: pointer; }
    .g-badge { padding: 6px 10px; border-radius: 12px; background: rgba(0,0,0,0.55); color: #fff; font-size: 12px; font-weight: 700; font-family: 'Press Start 2P', Arial, sans-serif; }
    #claim-btn { position: fixed; top: 60px; right: 10px; width: 120px; height: 36px; border-radius: 18px; border: none; background: linear-gradient(135deg,#FFD54F,#FF8A00); color: #000; font-weight: 800; font-size: 12px; font-family: 'Press Start 2P', Arial, sans-serif; cursor: pointer; }
    #claim-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
    .game-toast { position: fixed; top: 100px; right: 12px; background: rgba(0,0,0,0.9); color: #fff; padding: 8px 12px; border-radius: 8px; z-index: 10000; transform: translateX(100%); opacity: 0; transition: all .25s ease; font-family: 'Press Start 2P', Arial, sans-serif; font-size: 11px; }
    .game-toast.show { transform: translateX(0); opacity: 1; }
  `;
  document.head.appendChild(s);
}

function createTopBarUI() {
  if (document.getElementById('game-topbar')) return;
  topBar = document.createElement('div'); topBar.id = 'game-topbar';
  connectToggle = document.createElement('button'); connectToggle.className = 'g-toggle'; connectToggle.innerText = '🔗 Connect'; connectToggle.onclick = () => connectWallet();
  pointsBadge = document.createElement('div'); pointsBadge.className = 'g-badge'; pointsBadge.innerText = '⭐ 0';
  rewardBadge = document.createElement('div'); rewardBadge.className = 'g-badge'; rewardBadge.innerText = '💎 0.00';
  topBar.append(connectToggle, pointsBadge, rewardBadge); document.body.appendChild(topBar);
  claimToggle = document.createElement('button'); claimToggle.id = 'claim-btn'; claimToggle.innerText = '⚡ Claim'; claimToggle.onclick = redeemPoints; claimToggle.disabled = true;
  document.body.appendChild(claimToggle);
}

function toggleWeb3UI() {
  if (connectToggle) {
    connectToggle.innerText = (isWalletConnected && playerAddress) ? `✅ ${playerAddress.slice(0,6)}...${playerAddress.slice(-4)}` : '🔗 Connect';
  }
  if (pointsBadge) pointsBadge.innerText = `⭐ ${bnToNumberSafe(playerPoints)}`;
  if (rewardBadge) rewardBadge.innerText = `💎 ${formatReward(rewardPreview)}`;
  if (claimToggle) claimToggle.disabled = !(isWalletConnected && bnToNumberSafe(playerPoints) > 0);
}

/* ====== P5 GAME ====== */
const sketch = p5 => {
  let backgroundImg, spriteImage, birdyFont;
  let gameStart, gameOver, bird, pipe, floor, gameButton, gameText, score, storage, bestScore;

  p5.preload = () => {
    spriteImage = p5.loadImage(Images);
    backgroundImg = p5.loadImage(BackgroundImage);
    birdyFont = p5.loadFont(fontFile);
  };

  const resetGame = () => {
    gameStart = false; gameOver = false;
    bird = new Bird(p5, spriteImage); pipe = new Pipe(p5, spriteImage);
    floor = new Floor(p5, spriteImage); gameText = new Text(p5, birdyFont);
    gameButton = new Button(p5, gameText, spriteImage);
    storage = new Storage(); score = 0; pipe.generateFirst();
    const data = storage.getStorageData(); bestScore = data?.bestScore || 0;
  };

  const handleInput = () => {
    if (!gameOver) bird?.jump();
    if (!gameStart) gameStart = true;
    if (gameOver &&
      p5.mouseX > CANVAS_WIDTH / 2 - 85 &&
      p5.mouseX < CANVAS_WIDTH / 2 + 75 &&
      p5.mouseY > CANVAS_HEIGHT / 2 + 100 &&
      p5.mouseY < CANVAS_HEIGHT / 2 + 160) resetGame();
  };

  p5.setup = () => {
    p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT); p5.frameRate(60);
    injectStyles(); createTopBarUI(); toggleWeb3UI();
    autoConnectWallet();
    resetGame();
    p5.canvas.addEventListener('touchstart', e => { e.preventDefault(); handleInput(); }, { passive: false });
    p5.canvas.addEventListener('mousedown', e => { handleInput(); });
  };

  p5.draw = () => {
    if (backgroundImg) p5.image(backgroundImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const level = Math.floor(score / 10);
    if (gameStart && !gameOver) {
      pipe.move(level); pipe.draw(); bird.update(); bird.draw(); floor.update(); floor.draw();
      gameOver = pipe.checkCrash(bird) || bird.isDead();
      if (gameOver) {
        dieAudio.currentTime = 0; dieAudio.play();
        if (isWalletConnected && score > 0) setTimeout(() => submitScoreToBlockchain(score), 700);
      }
      if (pipe.getScore(bird)) { score++; pointAudio.currentTime = 0; pointAudio.play(); }
    } else {
      pipe.draw(); bird.draw(); floor.draw();
      if (gameOver) bird.update(); else floor.update();
    }
    if (!gameStart) gameText.startText();
    if (gameOver) {
      if (score > bestScore) { bestScore = score; storage.setStorageData({ bestScore: score }); }
      gameText.gameOverText(score, bestScore, level); gameButton.resetButton();
    } else gameText.scoreText(score, level);

    if (p5.frameCount % 60 === 0) {
      (async () => {
        try {
          if (isWalletConnected && contract && playerAddress) {
            playerPoints = await contract.playerPoints(playerAddress).catch(()=>ethers.BigNumber.from(0));
            rewardPreview = await contract.getRewardPreview(playerAddress).catch(()=>ethers.BigNumber.from(0));
          }
        } catch {}
        toggleWeb3UI();
      })();
    }
  };

  p5.keyPressed = e => {
    if (e.key === ' ') { if (!gameOver) bird?.jump(); if (!gameStart) gameStart = true; }
    if (e.key === 'r' && gameOver) resetGame();
  };
};

new P5(sketch, 'Game');