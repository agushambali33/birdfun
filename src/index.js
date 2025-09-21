// index.js (FULL FINAL V4 dengan Fix highScore, Toast, dan Rate 0.5 Token)
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
import wingSound from "./assets/sounds/wing.ogg";
import pointSound from "./assets/sounds/point.ogg";
import hitSound from "./assets/sounds/hit.ogg";
import dieSound from "./assets/sounds/die.ogg";
import { ethers } from 'ethers';

export const wingAudio = new Audio(wingSound);
export const pointAudio = new Audio(pointSound);
export const hitAudio = new Audio(hitSound);
export const dieAudio = new Audio(dieSound);

/* ====== CONFIG ====== */
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;
const HELIOS_CHAIN_ID_HEX = ethers.utils.hexValue(HELIOS_CHAIN_ID);

const CONTRACT_ADDRESS = '0xb9ccd00c2016444f58e2492117b49da317f4899b'; // V4
const VOUCHER_ENDPOINT = 'https://birdfunbackend.vercel.app/api/sign';
const CONTRACT_ABI = [
  "function claimReward(uint256 amount,uint256 nonce,uint256 expiry,bytes signature) external",
  "function getPoolBalance() external view returns (uint256)",
  "function lastNonce(address player) external view returns (uint256)",
  "function lastClaim(address player) external view returns (uint256)"
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
let playerScore = 0; // poin terkumpul (tidak hilang saat mati)
let rewardPreview = ethers.BigNumber.from(0);

/* ====== UI ELEMENTS ====== */
let topBar, connectToggle, pointsBadge, rewardBadge, claimToggle;

/* ====== HELPERS ====== */
const formatReward = (points) => {
  try {
    // 1 point = 0.5 HBIRD, jadi kalikan points dengan 0.5 * 10^18
    return ethers.utils.formatUnits(ethers.BigNumber.from(points).mul(ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(17))), 18);
  } catch {
    return "0.00";
  }
};

const logDebug = (msg) => console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`);

/* ====== TOAST ====== */
const showToast = (msg, type = 'info') => {
  const existing = document.querySelector('.game-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `game-toast ${type}`;
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2400);
};

/* ====== LOCAL STORAGE FOR PERSISTENCE ====== */
function savePlayerScore() {
  if (playerAddress) {
    localStorage.setItem(`playerScore_${playerAddress.toLowerCase()}`, playerScore.toString());
    logDebug(`Saved score for ${playerAddress}: ${playerScore}`);
  }
}

function loadPlayerScore() {
  if (playerAddress) {
    const saved = localStorage.getItem(`playerScore_${playerAddress.toLowerCase()}`);
    playerScore = saved ? parseInt(saved, 10) : 0;
    logDebug(`Loaded score for ${playerAddress}: ${playerScore}`);
    toggleWeb3UI();
  }
}

/* ====== WEB3 ACTIONS ====== */
async function connectWallet(silent = false) {
  if (typeof window.ethereum === 'undefined') {
    if (!silent) showToast('Please install MetaMask!', 'error');
    return false;
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
            nativeCurrency: { name: 'Helios', symbol: 'Hbird', decimals: 18 },
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
      return false;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    signer = provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    playerAddress = accounts[0].toLowerCase(); // Normalize to lowercase
    isWalletConnected = !!playerAddress;

    loadPlayerScore(); // Load score setelah connect
    toggleWeb3UI();
    if (!silent) showToast('Wallet connected', 'success');
    logDebug(`Wallet connected: ${playerAddress}`);

    window.ethereum.on('accountsChanged', () => {
      isWalletConnected = false;
      playerAddress = null;
      autoConnectWallet();
    });
    window.ethereum.on('chainChanged', () => {
      isWalletConnected = false;
      playerAddress = null;
      autoConnectWallet();
    });

    return true;
  } catch (err) {
    console.error('connectWallet error', err);
    if (!silent) showToast('Connect failed: ' + (err?.message || 'unknown'), 'error');
    return false;
  }
}

async function autoConnectWallet() {
  await connectWallet(true);
}

async function ensureWalletConnected() {
  if (!isWalletConnected || !contract || !signer || !playerAddress) {
    const connected = await connectWallet(true);
    if (!connected) {
      showToast('Please reconnect wallet', 'error');
      return false;
    }
  }
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== HELIOS_CHAIN_ID) {
      await connectWallet(true);
    }
    await signer.getAddress();
    return true;
  } catch (err) {
    console.error('ensureWalletConnected error', err);
    await connectWallet(true);
    return !!isWalletConnected;
  }
}

async function getNextNonce() {
  try {
    const last = await contractReadOnly.lastNonce(playerAddress);
    const next = last.toNumber() + 1;
    logDebug(`Next nonce for ${playerAddress}: ${next}`);
    return next;
  } catch (err) {
    console.error('getNextNonce error', err);
    logDebug(`getNextNonce error: ${err.message}`);
    return 1; // Fallback jika error
  }
}

async function checkCooldown() {
  try {
    const lastClaimTime = await contractReadOnly.lastClaim(playerAddress);
    const cooldownEnd = lastClaimTime.toNumber() + 30; // 30 detik cooldown dari kontrak
    const now = Math.floor(Date.now() / 1000);
    if (now < cooldownEnd) {
      const remaining = cooldownEnd - now;
      showToast(`Cooldown active! Wait ${remaining} seconds.`, 'warning');
      return false;
    }
    return true;
  } catch (err) {
    console.error('checkCooldown error', err);
    logDebug(`checkCooldown error: ${err.message}`);
    return true; // Assume ok jika error
  }
}

async function redeemPoints() {
  if (playerScore <= 0) {
    showToast('No points to claim', 'warning');
    return;
  }
  try {
    const connected = await ensureWalletConnected();
    if (!connected) return;

    const canClaim = await checkCooldown();
    if (!canClaim) return;

    showToast('Fetching token voucher...', 'loading');
    const nonce = await getNextNonce();
    const response = await fetch(
      `${VOUCHER_ENDPOINT}?player=${playerAddress}&amount=${playerScore}&nonce=${nonce}&contractAddress=${CONTRACT_ADDRESS}`
    );
    const voucher = await response.json();
    logDebug(`Voucher response: ${JSON.stringify(voucher)}`);

    if (!voucher.success) {
      showToast('Failed to get token voucher', 'error');
      return;
    }

    showToast('Claiming token...', 'loading');
    const tx = await contract.claimReward(
      voucher.amountWei,
      voucher.nonce,
      voucher.expiry,
      voucher.signature,
      { gasLimit: 500000 }
    );
    logDebug(`TX sent: ${tx.hash}`);
    const receipt = await tx.wait();
    logDebug(`TX confirmed in block ${receipt.blockNumber}`);

    playerScore = 0; // Reset setelah sukses claim
    savePlayerScore(); // Simpan reset score
    toggleWeb3UI();
    showToast('Token claimed!', 'success');
  } catch (err) {
    console.error('redeemPoints error', err);
    let errMsg = err?.message || 'Claim failed';
    if (errMsg.includes('NonceTooLow')) {
      errMsg = 'Invalid nonce - try again';
    } else if (errMsg.includes('CooldownActive')) {
      errMsg = 'Cooldown active - wait a bit';
    } else if (errMsg.includes('ExpiredVoucher')) {
      errMsg = 'Voucher expired - retry';
    }
    showToast(errMsg, 'error');
  }
}

/* ====== UI ====== */
function injectStyles() {
  const s = document.createElement('style');
  s.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    #game-topbar {
      position: fixed; top: 5px; left: 5px; display: flex; align-items: center; z-index: 9999;
    }
    .g-toggle {
      height: 28px; padding: 0 10px; border-radius: 12px; border: 2px solid #fff;
      background: linear-gradient(135deg, #00CED1, #20B2AA); color: #fff; font-size: 10px;
      font-weight: 700; font-family: 'Press Start 2P', Arial, sans-serif;
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    }
    .g-toggle.connected { background: linear-gradient(135deg, #32CD32, #228B22); }
    #web3-info { position: fixed; top: 5px; right: 5px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; z-index: 9999; }
    .g-badge { padding: 5px 8px; border-radius: 10px; background: rgba(0, 0, 0, 0.7); color: #fff;
      font-size: 10px; font-weight: 700; font-family: 'Press Start 2P', Arial, sans-serif; display: inline-flex; gap: 4px; }
    .g-badge.points { background: linear-gradient(135deg, #FFD700, #FFA500); }
    .g-badge.reward::after { content: ' Hbird'; font-size: 8px; margin-left: 4px; color: #00CED1; }
    #claim-btn { height: 28px; padding: 0 10px; border-radius: 12px; border: 2px solid #fff;
      background: linear-gradient(135deg, #FFD54F, #FF8A00); color: #000; font-weight: 800;
      font-size: 10px; font-family: 'Press Start 2P', Arial, sans-serif; cursor: pointer; }
    #claim-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
    .game-toast { position: fixed; top: 80px; right: 10px; background: rgba(0, 0, 0, 0.9); color: #fff;
      padding: 6px 10px; border-radius: 6px; z-index: 10000; font-family: 'Press Start 2P'; font-size: 10px; }
  `;
  document.head.appendChild(s);
}

function createTopBarUI() {
  if (document.getElementById('game-topbar')) return;
  topBar = document.createElement('div');
  topBar.id = 'game-topbar';
  
  connectToggle = document.createElement('button');
  connectToggle.className = 'g-toggle';
  connectToggle.innerText = '🦊 Connect Wallet';
  connectToggle.onclick = () => connectWallet();
  
  topBar.appendChild(connectToggle);
  document.body.appendChild(topBar);
  
  const web3Info = document.createElement('div');
  web3Info.id = 'web3-info';
  
  pointsBadge = document.createElement('div');
  pointsBadge.className = 'g-badge points';
  pointsBadge.innerText = '🏆 Score: 0';
  
  rewardBadge = document.createElement('div');
  rewardBadge.className = 'g-badge reward';
  rewardBadge.innerText = '0.00';
  
  claimToggle = document.createElement('button');
  claimToggle.id = 'claim-btn';
  claimToggle.innerText = 'Claim';
  claimToggle.onclick = redeemPoints;
  claimToggle.disabled = true;
  
  web3Info.append(pointsBadge, rewardBadge, claimToggle);
  document.body.appendChild(web3Info);
}

function toggleWeb3UI() {
  if (connectToggle) {
    connectToggle.innerText = (isWalletConnected && playerAddress)
      ? `✅ ${playerAddress.slice(0, 4)}...${playerAddress.slice(-4)}`
      : '🦊 Connect Wallet';
    connectToggle.classList.toggle('connected', isWalletConnected);
  }
  if (pointsBadge) {
    pointsBadge.innerText = `🏆 Score: ${playerScore}`;
  }
  if (rewardBadge) {
    rewardBadge.innerText = `${formatReward(playerScore)}`;
  }
  if (claimToggle) {
    claimToggle.disabled = !(isWalletConnected && playerScore > 0);
  }
}

/* ====== P5 GAME ====== */
const sketch = p5 => {
  let backgroundImg, spriteImage, birdyFont;
  let gameStart, gameOver, bird, pipe, floor, gameButton, gameText, score, storage, bestScore;

  p5.preload = () => {
    spriteImage = p5.loadImage(Images);
    backgroundImg = p5.loadImage(BackgroundImage);
    birdyFont = p5.loadFont(fontFile);
    storage = new Storage();
    // Inisialisasi bestScore dari Storage, default 0 jika kosong
    const storageData = storage.getStorageData() || { bestScore: 0 };
    bestScore = storageData.bestScore || 0;
    logDebug(`Loaded bestScore: ${bestScore}`);
  };

  const resetGame = () => {
    gameStart = false; gameOver = false;
    bird = new Bird(p5, spriteImage); pipe = new Pipe(p5, spriteImage);
    floor = new Floor(p5, spriteImage); gameText = new Text(p5, birdyFont);
    gameButton = new Button(p5, gameText, spriteImage);
    score = 0; pipe.generateFirst();
    toggleWeb3UI();
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
        playerScore += score; // score ditambah ke total player
        savePlayerScore(); // Simpan score ke localStorage
        toggleWeb3UI();
      }
      if (pipe.getScore(bird)) { score++; pointAudio.currentTime = 0; pointAudio.play(); }
    } else {
      pipe.draw(); bird.draw(); floor.draw();
      if (gameOver) bird.update(); else floor.update();
    }
    if (!gameStart) gameText.startText();
    if (gameOver) {
      if (score > bestScore) {
        bestScore = score;
        storage.setStorageData({ bestScore: score });
        logDebug(`New bestScore saved: ${bestScore}`);
      }
      gameText.gameOverText(score, bestScore, level); gameButton.resetButton();
    } else gameText.scoreText(score, level);
  };

  p5.keyPressed = e => {
    if (e.key === ' ') { if (!gameOver) bird?.jump(); if (!gameStart) gameStart = true; }
    if (e.key === 'r' && gameOver) resetGame();
  };
};

new P5(sketch, 'Game');