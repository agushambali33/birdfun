// index.js (FULL replacement)
// --- Assets & game imports (keep as-is) ---
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

// --- ethers/web3 ---
import { ethers } from 'ethers';

// --- NETWORK & CONTRACTS (you asked to hardcode) ---
// Helios Testnet (read-only fallback and chain add data)
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;            // decimal
const HELIOS_CHAIN_ID_HEX = ethers.utils.hexValue(HELIOS_CHAIN_ID); // '0xA410'

// Distribution contract (your contract)
const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e';
const CONTRACT_ABI = [
    "function submitPoints(uint256 _points) external",
    "function redeem() external",
    "function playerPoints(address) external view returns (uint256)",
    "function getRewardPreview(address) external view returns (uint256)",
    "function getPoolBalance() external view returns (uint256)"
];

// Token contract (badge next to Connect)
const TOKEN_ADDRESS = '0x5d9C011F4C8aD8efB4252f17e870085936CE296B';
const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

// --- Providers & contracts (global) ---
const providerReadonly = new ethers.providers.JsonRpcProvider(HELIOS_RPC); // read-only RPC
let provider = null;   // will be ethers.providers.Web3Provider(window.ethereum) after connect
let signer = null;
let contract = null;   // contract connected to signer (if connected)
let contractReadOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, providerReadonly);
let tokenContractReadOnly = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, providerReadonly);
let tokenContract = null; // will be set after connect

// --- State ---
let isWalletConnected = false;
let playerPoints = ethers.BigNumber.from(0);
let playerAddress = null;
let rewardPreview = ethers.BigNumber.from(0);

// token info caching
let tokenSymbol = 'TOKEN';
let tokenDecimals = 18;
let tokenBalanceBN = ethers.BigNumber.from(0);

// UI elements
let connectToggle, tokenBadge, pointsBadge, rewardBadge, claimToggle;

// Helpers
const bnToNumberSafe = (bn) => {
  try {
    if (!bn) return 0;
    if (typeof bn.toNumber === 'function') return bn.toNumber();
    return Number(bn) || 0;
  } catch (e) {
    // fallback for big numbers: parse as string (scores are small so safe)
    try { return Number(bn.toString()); } catch { return 0; }
  }
};

const formatRewardPreview = (valBN) => {
  try {
    if (!valBN) return '0.00';
    return Number(ethers.utils.formatEther(valBN)).toFixed(2);
  } catch (e) {
    try { return (Number(valBN) / 1e18).toFixed(2); } catch { return '0.00'; }
  }
};

const formatTokenBalance = (balBN, decimals = 18) => {
  try {
    return Number(ethers.utils.formatUnits(balBN, decimals)).toFixed(4);
  } catch (e) {
    try { return (Number(balBN.toString()) / (10 ** decimals)).toFixed(4); } catch { return '0.0000' }
  }
};

// --- Initialize token static info (symbol & decimals) ---
(async function initTokenInfo() {
  try {
    tokenSymbol = await tokenContractReadOnly.symbol();
  } catch (e) {
    console.warn('token symbol fetch failed, using TOKEN', e);
    tokenSymbol = 'TOKEN';
  }
  try {
    tokenDecimals = await tokenContractReadOnly.decimals();
    tokenDecimals = Number(tokenDecimals);
  } catch (e) {
    tokenDecimals = 18;
  }
})();

// === WEB3 FUNCTIONS ===
const connectWallet = async () => {
  console.log('🔄 Starting wallet connection...');
  if (typeof window.ethereum === 'undefined') {
    alert('Please install MetaMask!');
    return;
  }

  try {
    // 1) try switching to Helios Testnet
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: HELIOS_CHAIN_ID_HEX }]
      });
    } catch (switchErr) {
      // if chain not added (4902), request adding
      if (switchErr && switchErr.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: HELIOS_CHAIN_ID_HEX,
            chainName: 'Helios Testnet',
            nativeCurrency: { name: 'Helios', symbol: 'HLS', decimals: 18 },
            rpcUrls: [HELIOS_RPC, 'https://42000.rpc.thirdweb.com'],
            blockExplorerUrls: ['https://explorer.helioschainlabs.org']
          }]
        });
      } else {
        console.warn('chain switch error:', switchErr);
        // proceed — user may still connect on other chain but contract calls may revert
      }
    }

    // 2) request accounts
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    // 3) set provider & signer
    provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    signer = provider.getSigner();

    // 4) connect contract with signer
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    tokenContract = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider);

    // 5) get address and initial on-chain data
    try {
      playerAddress = await signer.getAddress();
      isWalletConnected = true;
    } catch (e) {
      console.error('getAddress error', e);
      playerAddress = null;
      isWalletConnected = false;
    }

    // fetch playerPoints & rewardPreview safely (try/catch)
    try {
      const pts = await contract.playerPoints(playerAddress);
      playerPoints = pts || ethers.BigNumber.from(0);
    } catch (e) {
      console.warn('playerPoints failed (maybe no data on contract or wrong chain):', e);
      playerPoints = ethers.BigNumber.from(0);
    }

    try {
      rewardPreview = await contract.getRewardPreview(playerAddress);
      rewardPreview = rewardPreview || ethers.BigNumber.from(0);
    } catch (e) {
      console.warn('getRewardPreview failed:', e);
      rewardPreview = ethers.BigNumber.from(0);
    }

    // fetch token balance
    try {
      tokenBalanceBN = await tokenContract.balanceOf(playerAddress);
    } catch (e) {
      console.warn('token balance fetch failed:', e);
      tokenBalanceBN = ethers.BigNumber.from(0);
    }

    // update UI
    toggleWeb3UI();
    animateConnectSuccess();

    // listen for account/chain changes
    window.ethereum.on('accountsChanged', async (accounts) => {
      // quick reload-safe strategy
      window.location.reload();
    });
    window.ethereum.on('chainChanged', (chainId) => {
      window.location.reload();
    });
  } catch (err) {
    console.error('Connection error:', err);
    alert('Failed to connect wallet: ' + (err.message || err));
  }
};

// submit score (transaction)
const submitScoreToBlockchain = async (score) => {
  if (!isWalletConnected || !contract) {
    showToast('Connect wallet first!', 'warning');
    return false;
  }
  try {
    showToast('Submitting score...', 'loading');
    const tx = await contract.submitPoints(score, { gasLimit: 300000 });
    await tx.wait();

    // refresh points & preview
    try { playerPoints = await contract.playerPoints(playerAddress); } catch (_) { playerPoints = ethers.BigNumber.from(0); }
    try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch (_) { rewardPreview = ethers.BigNumber.from(0); }
    // refresh token balance too
    try { tokenBalanceBN = await tokenContract.balanceOf(playerAddress); } catch (_) {}

    toggleWeb3UI();
    showToast(`+${score} points!`, 'success');
    animateScorePulse(pointsBadge, score);
    return true;
  } catch (error) {
    console.error('Submit error:', error);
    let msg = 'Submit failed: ';
    if (error && error.code === 4001) msg += 'Cancelled';
    else if (error && error.message && error.message.includes('insufficient funds')) msg += 'Low ETH';
    else msg += error?.message || error;
    showToast(msg, 'error');
    return false;
  }
};

// redeem/claim
const redeemPoints = async () => {
  if (!isWalletConnected || !contract) {
    showToast('Connect wallet first!', 'warning');
    return;
  }
  const pts = bnToNumberSafe(playerPoints);
  if (pts === 0) {
    showToast('No points to claim!', 'warning');
    return;
  }
  try {
    showToast('Claiming tokens...', 'loading');
    const tx = await contract.redeem({ gasLimit: 300000 });
    await tx.wait();

    // update local state
    playerPoints = ethers.BigNumber.from(0);
    rewardPreview = ethers.BigNumber.from(0);
    try { tokenBalanceBN = await tokenContract.balanceOf(playerAddress); } catch (e) { /* ignore */ }

    toggleWeb3UI();
    showToast(`Claimed tokens! 🎉`, 'success');
    animateClaimSuccess();
  } catch (error) {
    console.error('Redeem error:', error);
    let msg = 'Claim failed: ';
    if (error && error.code === 4001) msg += 'Cancelled';
    else msg += error?.message || error;
    showToast(msg, 'error');
  }
};

// === UI helpers & creation ===
const toggleWeb3UI = () => {
  // left: Connect + token badge
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

  if (tokenBadge) {
    // show token symbol and balance if connected, otherwise symbol only
    if (isWalletConnected && playerAddress) {
      const bal = formatTokenBalance(tokenBalanceBN, tokenDecimals);
      tokenBadge.innerHTML = `${tokenSymbol} ${bal}`;
      tokenBadge.title = `${TOKEN_ADDRESS}`;
      tokenBadge.className = 'token-badge active';
    } else {
      tokenBadge.innerHTML = `${tokenSymbol} --`;
      tokenBadge.title = `${TOKEN_ADDRESS}`;
      tokenBadge.className = 'token-badge';
    }
  }

  // right: points
  if (pointsBadge) {
    const ptsNum = bnToNumberSafe(playerPoints);
    pointsBadge.innerHTML = ptsNum || 0;
    pointsBadge.className = ptsNum > 0 ? 'badge active' : 'badge';
  }

  if (rewardBadge) {
    const tokens = formatRewardPreview(rewardPreview);
    rewardBadge.innerHTML = `💎 ${tokens}`;
    rewardBadge.className = (Number(tokens) > 0) ? 'badge reward active' : 'badge reward';
  }

  if (claimToggle) {
    const ptsNum = bnToNumberSafe(playerPoints);
    const canClaim = ptsNum > 0 && isWalletConnected;
    claimToggle.disabled = !canClaim;
    claimToggle.className = canClaim ? 'toggle claim active' : 'toggle claim inactive';
    claimToggle.innerHTML = canClaim ? '⚡ Claim Reward' : '⚡ Claim Reward';
    claimToggle.style.opacity = canClaim ? '1' : '0.5';
  }
};

const addCompactStyles = () => {
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');

    .toggle { transition: all 0.25s cubic-bezier(.4,0,.2,1); font-family: 'Press Start 2P', 'FlappyBirdy', Arial, sans-serif; }
    .toggle.connected { background: linear-gradient(135deg,#4CAF50,#45a049) !important; color: white; padding: 8px 10px; border-radius: 16px; box-shadow: 0 3px 12px rgba(76,175,80,0.3); }
    .token-badge { margin-left:8px; padding:6px 10px; border-radius:12px; background: rgba(0,0,0,0.5); color:#fff; font-size:12px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); cursor: default; font-family: 'Press Start 2P', 'FlappyBirdy', Arial, sans-serif; }
    .token-badge.active { background: linear-gradient(90deg,#1f2937,#111827); box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
    .badge { transition: all 0.3s ease; padding: 8px 10px; border-radius: 12px; background: rgba(0,0,0,0.5); color:#fff; font-family: 'Press Start 2P', 'FlappyBirdy', Arial, sans-serif; font-weight:700; }
    .badge.active { background: rgba(76,175,80,0.25); border: 1px solid rgba(76,175,80,0.5); color:#4CAF50; box-shadow: 0 4px 12px rgba(76,175,80,0.08); transform: scale(1.05); }
    .badge.reward.active { background: rgba(255,215,0,0.18); color:#FFD700; box-shadow: 0 6px 18px rgba(255,215,0,0.12); }
    .toggle.claim.active { background: linear-gradient(135deg,#FFD54F,#FF8A00); color:black; padding:8px 12px; border-radius: 18px; cursor:pointer; box-shadow: 0 4px 12px rgba(255,165,0,0.25); font-weight:700; }
    .toggle.claim.inactive { background: rgba(158,158,158,0.25); color:#ddd; padding:8px 12px; border-radius: 18px; cursor:not-allowed; }
    .toast { position: fixed; top: 80px; right: 15px; background: rgba(0,0,0,0.9); backdrop-filter: blur(8px); border-radius:12px; padding:8px 12px; font-size:11px; font-weight:500; z-index:10002; min-width:140px; box-shadow: 0 6px 24px rgba(0,0,0,0.4); border-left:3px solid; opacity:0; transform:translateX(100%); transition: all 0.3s ease; display:flex; align-items:center; gap:8px; }
    .toast.show { opacity:1; transform:translateX(0); }
    .toast.success { border-left-color:#4CAF50; color:#4CAF50; } .toast.error { border-left-color:#f44336; color:#f44336; } .toast.warning { border-left-color:#ff9800; color:#ff9800; } .toast.loading { border-left-color:#9E9E9E; color:#9E9E9E; }
  `;
  document.head.appendChild(style);
};

const showToast = (message, type = 'info') => {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, 2500);
};

// small animations
const animateConnectSuccess = () => { if (connectToggle) { connectToggle.style.transform='scale(0.96)'; setTimeout(()=>connectToggle.style.transform='scale(1)',160); } };
const animateScorePulse = (el, score) => { if (!el) return; el.style.transform='scale(1.2)'; setTimeout(()=>el.style.transform='scale(1)',250); };
const animateClaimSuccess = () => { if (pointsBadge) { pointsBadge.style.transform='scale(0.9)'; setTimeout(()=>pointsBadge.style.transform='scale(1)',220); } };

// === COMPACT UI CREATION ===
const createCompactUI = () => {
  // top-left container
  connectToggle = document.createElement('button');
  connectToggle.className = 'toggle';
  connectToggle.innerHTML = '🔗 Connect';
  connectToggle.style.cssText = `
      position: fixed;
      top: 15px;
      left: 15px;
      height: 36px;
      padding: 6px 10px;
      border: none;
      z-index: 10001;
      cursor: pointer;
  `;
  connectToggle.onclick = connectWallet;

  // token badge (to the right of connect)
  tokenBadge = document.createElement('div');
  tokenBadge.className = 'token-badge';
  tokenBadge.innerText = `${tokenSymbol} --`;
  tokenBadge.style.cssText = `
      position: fixed;
      top: 15px;
      left: calc(15px + 120px); /* push to the right of connect roughly */
      height: 36px;
      line-height: 20px;
      z-index: 10001;
      display: flex;
      align-items: center;
      padding: 6px 10px;
  `;
  tokenBadge.onclick = () => {
    // open explorer token page (best-effort)
    const url = `https://explorer.helioschainlabs.org/token/${TOKEN_ADDRESS}`;
    window.open(url, '_blank');
  };

  document.body.appendChild(connectToggle);
  document.body.appendChild(tokenBadge);

  // top-right: points & reward
  pointsBadge = document.createElement('div');
  pointsBadge.className = 'badge';
  pointsBadge.innerHTML = '0';
  pointsBadge.style.cssText = `
    position: fixed;
    top: 15px;
    right: 15px;
    height: 36px;
    padding: 6px 12px;
    display:flex;
    align-items:center;
    justify-content:center;
    z-index:10001;
  `;
  document.body.appendChild(pointsBadge);

  rewardBadge = document.createElement('div');
  rewardBadge.className = 'badge reward';
  rewardBadge.innerHTML = '💎 0.00';
  rewardBadge.style.cssText = `
    position: fixed;
    top: 15px;
    right: calc(15px + 90px);
    height: 36px;
    padding: 6px 10px;
    display:flex;
    align-items:center;
    justify-content:center;
    z-index:10001;
  `;
  document.body.appendChild(rewardBadge);

  // claim button: below points (right top)
  claimToggle = document.createElement('button');
  claimToggle.className = 'toggle claim inactive';
  claimToggle.innerText = '⚡ Claim Reward';
  claimToggle.style.cssText = `
    position: fixed;
    top: 60px;
    right: 15px;
    width: 140px;
    height: 38px;
    border: none;
    z-index: 10001;
    cursor: pointer;
  `;
  claimToggle.onclick = redeemPoints;
  document.body.appendChild(claimToggle);

  addCompactStyles();
  toggleWeb3UI();
};

// === GAME (p5) ===
const sketch = p5 => {
  let background = p5.loadImage(BackgroundImage);
  let spriteImage = p5.loadImage(Images);
  let birdyFont = p5.loadFont(fontFile);
  let gameStart, gameOver, bird, pipe, floor, gameButton, gameText, score, storage, bestScore;

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
    const canvas = p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    canvas.mousePressed(canvasClick);
    canvas.touchStarted(canvasTouch);

    // Create compact UI (connect, token badge, points, reward, claim)
    createCompactUI();
    resetGame();
  };

  p5.draw = () => {
    p5.image(background, 0, 0);
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
        if (isWalletConnected && score > 0) {
          // submit after short delay so game-over anims show
          setTimeout(() => submitScoreToBlockchain(score), 800);
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

    // Keep UI synchronized (safe refresh every 60 frames)
    if (p5.frameCount % 60 === 0) {
      // refresh token balance if connected
      (async () => {
        if (isWalletConnected && tokenContract && playerAddress) {
          try { tokenBalanceBN = await tokenContract.balanceOf(playerAddress); } catch {}
        }
        // also refresh points/rewardPreview read-only if needed
        try {
          if (isWalletConnected && contract) {
            playerPoints = await contract.playerPoints(playerAddress);
            rewardPreview = await contract.getRewardPreview(playerAddress);
          } else {
            // best-effort: if not connected, keep previous or read from readonly (no player address)
          }
        } catch (e) { /* ignore */ }
        toggleWeb3UI();
      })();
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
};

new P5(sketch, 'Game');