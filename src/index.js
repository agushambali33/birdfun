// index.js (FULL, replace your existing file)
// Keep all original asset imports / paths the same as your project
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
// Helios testnet (read-only RPC & chain metadata)
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;
const HELIOS_CHAIN_ID_HEX = ethers.utils.hexValue(HELIOS_CHAIN_ID);

// Distribution contract (use your contract)
const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e';
const CONTRACT_ABI = [
  "function submitPoints(uint256 _points) external",
  "function redeem() external",
  "function playerPoints(address) external view returns (uint256)",
  "function getRewardPreview(address) external view returns (uint256)",
  "function getPoolBalance() external view returns (uint256)"
];

/* ====== PROVIDERS & CONTRACTS ====== */
// readonly provider (safe fallback)
const providerReadonly = new ethers.providers.JsonRpcProvider(HELIOS_RPC);

// will be set after user connects
let provider = null;         // ethers.providers.Web3Provider(window.ethereum)
let signer = null;
let contract = null;         // contract connected to signer
let contractReadOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, providerReadonly);

/* ====== STATE ====== */
let isWalletConnected = false;
let playerAddress = null;
let playerPoints = ethers.BigNumber.from(0);
let rewardPreview = ethers.BigNumber.from(0);

/* ====== UI ELEMENTS ====== */
let topBar, connectToggle, pointsBadge, rewardBadge, claimToggle;

/* ====== UTIL HELPERS ====== */
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

/* ====== TOAST (simple) ====== */
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

/* ====== GLOBAL ERROR HOOK (debug) ====== */
window.addEventListener('error', (ev) => {
  // log to console but don't break UI
  // ev.error may be useful to paste to me if something still breaks
  // console.error('Global error', ev.error || ev.message, ev);
});

/* ====== WEB3 ACTIONS ====== */
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    showToast('Please install MetaMask!', 'error');
    return;
  }
  try {
    // try switch chain, if not added request add
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: HELIOS_CHAIN_ID_HEX }]
      });
    } catch (switchErr) {
      if (switchErr && switchErr.code === 4902) {
        // chain not found in wallet -> add it
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
      } else {
        // ignore other switch errors and continue (user may be on another chain)
      }
    }

    // request accounts
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    // prefer Web3Provider for signer (so getSigner() works)
    provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    signer = provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // fetch address & on-chain view data (safely)
    try { playerAddress = await signer.getAddress(); isWalletConnected = !!playerAddress; } catch (e) { playerAddress = null; isWalletConnected = false; }
    try { playerPoints = await contract.playerPoints(playerAddress); } catch { playerPoints = ethers.BigNumber.from(0); }
    try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch { rewardPreview = ethers.BigNumber.from(0); }

    toggleWeb3UI();
    showToast('Wallet connected', 'success');

    // reload on account/chain changes for reliability
    window.ethereum.on('accountsChanged', () => window.location.reload());
    window.ethereum.on('chainChanged', () => window.location.reload());
  } catch (err) {
    console.error('connectWallet error', err);
    showToast('Connect failed: ' + (err?.message || 'unknown'), 'error');
  }
}

async function submitScoreToBlockchain(score) {
  if (!contract || !isWalletConnected) {
    showToast('Connect wallet first', 'warning');
    return false;
  }
  try {
    showToast('Submitting score...', 'loading');
    const tx = await contract.submitPoints(score, { gasLimit: 300000 });
    await tx.wait();
    // update local view values (try/catch safe)
    try { playerPoints = await contract.playerPoints(playerAddress); } catch { playerPoints = ethers.BigNumber.from(0); }
    try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch { rewardPreview = ethers.BigNumber.from(0); }
    toggleWeb3UI();
    showToast(`Score ${score} submitted`, 'success');
    return true;
  } catch (err) {
    console.error('submitScore error', err);
    const msg = err?.message || 'Submit failed';
    showToast(msg, 'error');
    return false;
  }
}

async function redeemPoints() {
  if (!contract || !isWalletConnected) {
    showToast('Connect wallet first', 'warning');
    return;
  }
  const ptsNum = bnToNumberSafe(playerPoints);
  if (ptsNum <= 0) { showToast('No points to claim', 'warning'); return; }
  try {
    showToast('Claiming...', 'loading');
    const tx = await contract.redeem({ gasLimit: 300000 });
    await tx.wait();
    // refresh
    try { playerPoints = await contract.playerPoints(playerAddress); } catch { playerPoints = ethers.BigNumber.from(0); }
    try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch { rewardPreview = ethers.BigNumber.from(0); }
    toggleWeb3UI();
    showToast('Claimed!', 'success');
  } catch (err) {
    console.error('redeem error', err);
    showToast(err?.message || 'Claim failed', 'error');
  }
}

/* ====== UI CREATION & STYLES ====== */
function injectStyles() {
  const s = document.createElement('style');
  s.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

    /* top bar */
    #game-topbar {
      position: fixed;
      top: 10px;
      left: 10px;
      right: 10px;
      display: flex;
      gap: 8px;
      align-items: center;
      z-index: 9999;
      flex-wrap: wrap;
      pointer-events: auto;
    }
    .g-toggle {
      height: 34px;
      padding: 0 12px;
      border-radius: 16px;
      border: none;
      background: linear-gradient(135deg,#6b7280,#111827);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Press Start 2P', Arial, sans-serif;
      display: inline-flex;
      align-items: center;
      gap:8px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      cursor: pointer;
    }
    .g-badge {
      padding: 6px 10px;
      border-radius: 12px;
      background: rgba(0,0,0,0.55);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      font-family: 'Press Start 2P', Arial, sans-serif;
    }
    #claim-btn {
      position: fixed;
      top: 60px;
      right: 10px;
      width: 120px;
      height: 36px;
      border-radius: 18px;
      border: none;
      background: linear-gradient(135deg,#FFD54F,#FF8A00);
      color: #000;
      font-weight: 800;
      font-size: 12px;
      font-family: 'Press Start 2P', Arial, sans-serif;
      box-shadow: 0 6px 18px rgba(255,165,0,0.18);
      z-index: 9999;
      cursor: pointer;
    }
    #claim-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
    /* toast */
    .game-toast {
      position: fixed;
      top: 100px;
      right: 12px;
      background: rgba(0,0,0,0.9);
      color: #fff;
      padding: 8px 12px;
      border-radius: 8px;
      z-index: 10000;
      transform: translateX(100%);
      opacity: 0;
      transition: all .25s ease;
      font-family: 'Press Start 2P', Arial, sans-serif;
      font-size: 11px;
    }
    .game-toast.show { transform: translateX(0); opacity: 1; }
    .game-toast.loading { border-left: 4px solid #9E9E9E; }
    .game-toast.success { border-left: 4px solid #4CAF50; }
    .game-toast.error { border-left: 4px solid #f44336; }
  `;
  document.head.appendChild(s);
}

function createTopBarUI() {
  // avoid double creation
  if (document.getElementById('game-topbar')) return;

  topBar = document.createElement('div');
  topBar.id = 'game-topbar';

  // connect button
  connectToggle = document.createElement('button');
  connectToggle.className = 'g-toggle';
  connectToggle.innerText = '🔗 Connect';
  connectToggle.onclick = connectWallet;
  topBar.appendChild(connectToggle);

  // points badge (left aligned)
  pointsBadge = document.createElement('div');
  pointsBadge.className = 'g-badge';
  pointsBadge.innerText = '⭐ 0';
  topBar.appendChild(pointsBadge);

  // reward preview badge
  rewardBadge = document.createElement('div');
  rewardBadge.className = 'g-badge';
  rewardBadge.innerText = '💎 0.00';
  topBar.appendChild(rewardBadge);

  document.body.appendChild(topBar);

  // claim button (fixed right top)
  claimToggle = document.createElement('button');
  claimToggle.id = 'claim-btn';
  claimToggle.innerText = '⚡ Claim';
  claimToggle.onclick = redeemPoints;
  claimToggle.disabled = true;
  document.body.appendChild(claimToggle);
}

function toggleWeb3UI() {
  // connect label
  if (connectToggle) {
    if (isWalletConnected && playerAddress) {
      connectToggle.innerText = `✅ ${playerAddress.slice(0,6)}...${playerAddress.slice(-4)}`;
    } else {
      connectToggle.innerText = '🔗 Connect';
    }
  }

  // points
  if (pointsBadge) {
    const v = bnToNumberSafe(playerPoints);
    pointsBadge.innerText = `⭐ ${v}`;
  }

  // reward
  if (rewardBadge) {
    const r = formatReward(rewardPreview);
    rewardBadge.innerText = `💎 ${r}`;
  }

  // claim button state
  if (claimToggle) {
    const can = isWalletConnected && bnToNumberSafe(playerPoints) > 0;
    claimToggle.disabled = !can;
  }
}

/* ====== P5 GAME (robust preload) ====== */
const sketch = p5 => {
  let backgroundImg, spriteImage, birdyFont;
  let gameStart, gameOver, bird, pipe, floor, gameButton, gameText, score, storage, bestScore;

  // safe loader: tries import path, string fallback
  const safeLoadImg = (src, onSuccess, onError) => {
    // p5 loadImage supports success/error callbacks
    try {
      return p5.loadImage(src, onSuccess, onError);
    } catch (e) {
      // fallback: try string coercion
      try { return p5.loadImage(String(src), onSuccess, onError); } catch (e2) {
        // final fallback create tiny image so game won't crash
        const img = p5.createImage(1,1);
        if (onSuccess) onSuccess(img);
        return img;
      }
    }
  };

  p5.preload = () => {
    // attempt to load assets robustly
    try {
      spriteImage = safeLoadImg(Images, () => {}, () => {});
    } catch (e) {
      spriteImage = p5.createImage(1,1);
      console.warn('sprite load fallback', e);
    }
    try {
      backgroundImg = safeLoadImg(BackgroundImage, () => {}, () => {});
    } catch (e) {
      backgroundImg = p5.createImage(1,1);
      console.warn('background load fallback', e);
    }
    try {
      birdyFont = p5.loadFont(fontFile);
    } catch (e) {
      try { birdyFont = p5.loadFont(String(fontFile)); } catch (e2) { birdyFont = null; console.warn('font fallback', e2); }
    }
  };

  const resetGame = () => {
    gameStart = false;
    gameOver = false;
    bird = new Bird(p5, spriteImage);
    pipe = new Pipe(p5, spriteImage);
    floor = new Floor(p5, spriteImage);
    gameText = new Text(p5, birdyFont);
    gameButton = new Button(p5, gameText, spriteImage);
    storage = new Storage();
    score = 0;
    pipe.generateFirst();
    bird.draw();
    floor.draw();
    const dataFromStorage = storage.getStorageData();
    bestScore = dataFromStorage?.bestScore || 0;
  };

  const canvasClick = () => {
    if (p5.mouseButton === 'left') {
      if (!gameOver) bird?.jump();
      if (!gameStart) gameStart = true;
      if (gameOver &&
        p5.mouseX > CANVAS_WIDTH / 2 - 85 &&
        p5.mouseX < CANVAS_WIDTH / 2 + 75 &&
        p5.mouseY > CANVAS_HEIGHT / 2 + 100 &&
        p5.mouseY < CANVAS_HEIGHT / 2 + 160
      ) resetGame();
    }
  };

  const canvasTouch = () => {
    if (!gameOver) bird?.jump();
    if (!gameStart) gameStart = true;
  };

  p5.setup = () => {
    p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    p5.frameRate(60);

    // Create UI (once)
    injectStyles();
    createTopBarUI();
    toggleWeb3UI();

    // reset the game state
    resetGame();

    // attach canvas events
    const cvs = p5.canvas;
    if (cvs) {
      cvs.addEventListener('touchstart', (e) => {
        e.preventDefault();
        canvasTouch();
      }, { passive: false });
    }
  };

  p5.draw = () => {
    try {
      // draw background (use image or fallback color)
      if (backgroundImg && backgroundImg.width > 1) p5.image(backgroundImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      else p5.background(135, 206, 235);

      const level = Math.floor(score / 10);

      if (gameStart && !gameOver) {
        pipe.move(level);
        pipe.draw();
        bird.update();
        bird.draw();
        floor.update();
        floor.draw();

        gameOver = pipe.checkCrash(bird) || bird.isDead();

        if (gameOver) {
          dieAudio.currentTime = 0;
          dieAudio.play();
          // submit points (non-blocking)
          if (isWalletConnected && score > 0) {
            // short delay so game-over shows
            setTimeout(() => { submitScoreToBlockchain(score); }, 700);
          }
        }

        if (pipe.getScore(bird)) {
          score++;
          pointAudio.currentTime = 0;
          pointAudio.play();
        }
      } else {
        pipe.draw();
        bird.draw();
        floor.draw();
        if (gameOver) bird.update();
        else floor.update();
      }

      if (!gameStart) gameText.startText();
      if (gameOver) {
        if (score > bestScore) {
          bestScore = score;
          storage.setStorageData({ bestScore: score });
        }
        gameText.gameOverText(score, bestScore, level);
        gameButton.resetButton();
      } else {
        gameText.scoreText(score, level);
      }

      // periodic UI refresh (every 60 frames ~ 1s)
      if (p5.frameCount % 60 === 0) {
        (async () => {
          // if connected, try to refresh on-chain values quietly
          try {
            if (isWalletConnected && contract && playerAddress) {
              const pts = await contract.playerPoints(playerAddress).catch(()=>ethers.BigNumber.from(0));
              playerPoints = pts || ethers.BigNumber.from(0);
              const rp = await contract.getRewardPreview(playerAddress).catch(()=>ethers.BigNumber.from(0));
              rewardPreview = rp || ethers.BigNumber.from(0);
            }
          } catch (e) { /* ignore */ }
          toggleWeb3UI();
        })();
      }
    } catch (drawErr) {
      // If drawing fails, log but don't throw to avoid full page crash
      console.error('Draw error', drawErr);
    }
  };

  p5.keyPressed = (e) => {
    if (e.key === ' ') {
      if (!gameOver) bird?.jump();
      if (!gameStart) gameStart = true;
    }
    if (e.key === 'r' && gameOver) {
      resetGame();
    }
  };
}; // end sketch

// start p5
new P5(sketch, 'Game');