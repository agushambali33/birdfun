// index.js (FULL, replace your existing file) import './main.scss'; import { CANVAS_HEIGHT, CANVAS_WIDTH } from './game/constants'; import Pipe from './game/pipe'; import Bird from './game/bird'; import Floor from './game/floor'; import Text from './game/gameText'; import Button from './game/gameButton'; import P5 from 'p5'; import Images from './assets/sprite.png'; import BackgroundImage from './assets/background.png'; import fontFile from './assets/FlappyBirdy.ttf'; import Storage from './storage';

// sounds import wingSound from "./assets/sounds/wing.ogg"; import pointSound from "./assets/sounds/point.ogg"; import hitSound from "./assets/sounds/hit.ogg"; import dieSound from "./assets/sounds/die.ogg";

export const wingAudio = new Audio(wingSound); export const pointAudio = new Audio(pointSound); export const hitAudio = new Audio(hitSound); export const dieAudio = new Audio(dieSound);

// ethers import { ethers } from 'ethers';

/* ====== CONFIG ====== */ const HELIOS_RPC = 'https://testnet1.helioschainlabs.org'; const HELIOS_CHAIN_ID = 42000; const HELIOS_CHAIN_ID_HEX = ethers.utils.hexValue(HELIOS_CHAIN_ID);

const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e'; const CONTRACT_ABI = [ "function submitPoints(uint256 _points) external", "function redeem() external", "function playerPoints(address) external view returns (uint256)", "function getRewardPreview(address) external view returns (uint256)", "function getPoolBalance() external view returns (uint256)" ];

/* ====== PROVIDERS & CONTRACTS ====== */ const providerReadonly = new ethers.providers.JsonRpcProvider(HELIOS_RPC); let provider = null; let signer = null; let contract = null; let contractReadOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, providerReadonly);

/* ====== STATE ====== */ let isWalletConnected = false; let playerAddress = null; let playerPoints = ethers.BigNumber.from(0); let rewardPreview = ethers.BigNumber.from(0);

/* ====== UI ELEMENTS ====== */ let topBar, connectToggle, pointsBadge, rewardBadge, claimToggle;

/* ====== HELPERS ====== */ const bnToNumberSafe = (bn) => { try { if (!bn) return 0; if (typeof bn.toNumber === 'function') return bn.toNumber(); return Number(bn) || 0; } catch { try { return Number(bn.toString()); } catch { return 0; } } };

const formatReward = (bn) => { try { if (!bn) return '0.00'; return Number(ethers.utils.formatEther(bn)).toFixed(2); } catch { try { return (Number(bn) / 1e18).toFixed(2); } catch { return '0.00'; } } };

/* ====== TOAST ====== */ const showToast = (msg, type = 'info') => { const existing = document.querySelector('.game-toast'); if (existing) existing.remove(); const t = document.createElement('div'); t.className = game-toast ${type}; t.innerText = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 2400); };

/* ====== WEB3 ACTIONS ====== */ async function connectWallet() { if (typeof window.ethereum === 'undefined') { showToast('Please install MetaMask!', 'error'); return; } try { try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: HELIOS_CHAIN_ID_HEX }] }); } catch (switchErr) { if (switchErr && switchErr.code === 4902) { await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: HELIOS_CHAIN_ID_HEX, chainName: 'Helios Testnet', nativeCurrency: { name: 'Helios', symbol: 'HLS', decimals: 18 }, rpcUrls: [HELIOS_RPC], blockExplorerUrls: ['https://explorer.helioschainlabs.org'] }] }); } }

await window.ethereum.request({ method: 'eth_requestAccounts' });
provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
signer = provider.getSigner();
contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

try { playerAddress = await signer.getAddress(); isWalletConnected = !!playerAddress; } catch { playerAddress = null; isWalletConnected = false; }
try { playerPoints = await contract.playerPoints(playerAddress); } catch { playerPoints = ethers.BigNumber.from(0); }
try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch { rewardPreview = ethers.BigNumber.from(0); }

toggleWeb3UI();
showToast('Wallet connected', 'success');

window.ethereum.on('accountsChanged', () => window.location.reload());
window.ethereum.on('chainChanged', () => window.location.reload());

} catch (err) { console.error('connectWallet error', err); showToast('Connect failed: ' + (err?.message || 'unknown'), 'error'); } }

async function submitScoreToBlockchain(score) { if (!contract || !isWalletConnected) { return false; } try { showToast('Submitting score...', 'loading'); const tx = await contract.submitPoints(score, { gasLimit: 300000 }); tx.wait().then(async () => { try { playerPoints = await contract.playerPoints(playerAddress); } catch {} try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch {} toggleWeb3UI(); showToast(Score ${score} submitted, 'success'); }).catch(() => {}); return true; } catch (err) { console.error('submitScore error', err); showToast(err?.message || 'Submit failed', 'error'); return false; } }

async function redeemPoints() { if (!contract || !isWalletConnected) return; const ptsNum = bnToNumberSafe(playerPoints); if (ptsNum <= 0) { showToast('No points to claim', 'warning'); return; } try { showToast('Claiming...', 'loading'); const tx = await contract.redeem({ gasLimit: 300000 }); tx.wait().then(async () => { try { playerPoints = await contract.playerPoints(playerAddress); } catch {} try { rewardPreview = await contract.getRewardPreview(playerAddress); } catch {} toggleWeb3UI(); showToast('Claimed!', 'success'); }).catch(() => {}); } catch (err) { console.error('redeem error', err); showToast(err?.message || 'Claim failed', 'error'); } }

/* ====== UI ====== */ function injectStyles() { const s = document.createElement('style'); s.innerHTML = @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap'); #game-topbar { position: fixed; top: 10px; left: 10px; right: 10px; display: flex; gap: 8px; align-items: center; z-index: 9999; flex-wrap: wrap; pointer-events: auto; } .g-toggle, #claim-btn { height: 34px; padding: 0 12px; border-radius: 16px; border: none; font-size: 12px; font-weight: 700; font-family: 'Press Start 2P', Arial, sans-serif; display: inline-flex; align-items: center; gap:8px; cursor: pointer; } .g-toggle { background: linear-gradient(135deg,#6b7280,#111827); color: #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.25); } #claim-btn { background: linear-gradient(135deg,#FFD54F,#FF8A00); color: #000; box-shadow: 0 6px 18px rgba(255,165,0,0.18); } #claim-btn[disabled] { opacity: 0.55; cursor: not-allowed; } .g-badge { padding: 6px 10px; border-radius: 12px; background: rgba(0,0,0,0.55); color: #fff; font-size: 12px; font-weight: 700; font-family: 'Press Start 2P', Arial, sans-serif; } .game-toast { position: fixed; top: 60px; right: 12px; background: rgba(0,0,0,0.9); color: #fff; padding: 8px 12px; border-radius: 8px; z-index: 10000; transform: translateX(100%); opacity: 0; transition: all .25s ease; font-family: 'Press Start 2P', Arial, sans-serif; font-size: 11px; } .game-toast.show { transform: translateX(0); opacity: 1; } .game-toast.loading { border-left: 4px solid #9E9E9E; } .game-toast.success { border-left: 4px solid #4CAF50; } .game-toast.error { border-left: 4px solid #f44336; }; document.head.appendChild(s); }

function createTopBarUI() { if (document.getElementById('game-topbar')) return; topBar = document.createElement('div'); topBar.id = 'game-topbar';

connectToggle = document.createElement('button'); connectToggle.className = 'g-toggle'; connectToggle.innerText = '🔗 Connect'; connectToggle.onclick = connectWallet; topBar.appendChild(connectToggle);

pointsBadge = document.createElement('div'); pointsBadge.className = 'g-badge'; pointsBadge.innerText = '⭐ 0'; topBar.appendChild(pointsBadge);

rewardBadge = document.createElement('div'); rewardBadge.className = 'g-badge'; rewardBadge.innerText = '💎 0.00'; topBar.appendChild(rewardBadge);

claimToggle = document.createElement('button'); claimToggle.id = 'claim-btn'; claimToggle.innerText = '⚡ Claim'; claimToggle.onclick = redeemPoints; claimToggle.disabled = true; topBar.appendChild(claimToggle);

document.body.appendChild(topBar); }

function toggleWeb3UI() { if (connectToggle) { if (isWalletConnected && playerAddress) { connectToggle.innerText = ✅ ${playerAddress.slice(0,6)}...${playerAddress.slice(-4)}; } else { connectToggle.innerText = '🔗 Connect'; } } if (pointsBadge) pointsBadge.innerText = ⭐ ${bnToNumberSafe(playerPoints)}; if (rewardBadge) rewardBadge.innerText = 💎 ${formatReward(rewardPreview)}; if (claimToggle) claimToggle.disabled = !(isWalletConnected && bnToNumberSafe(playerPoints) > 0); }

/* ====== GAME ====== */ const sketch = p5 => { let backgroundImg, spriteImage, birdyFont; let gameStart, gameOver, bird, pipe, floor, gameButton, gameText, score, storage, bestScore;

const safeLoadImg = (src, onSuccess, onError) => { try { return p5.loadImage(src, onSuccess, onError); } catch { return p5.createImage(1,1); } };

p5.preload = () => { try { spriteImage = safeLoadImg(Images); } catch { spriteImage = p5.createImage(1,1); } try { backgroundImg = safeLoadImg(BackgroundImage); } catch { backgroundImg = p5.createImage(1,1); } try { birdyFont = p5.loadFont(fontFile); } catch { birdyFont = null; } };

const resetGame = () => { gameStart = false; gameOver = false; bird = new Bird(p5, spriteImage); pipe = new Pipe(p5, spriteImage); floor = new Floor(p5, spriteImage); gameText = new Text(p5, birdyFont); gameButton = new Button(p5, gameText, spriteImage); storage = new Storage(); score = 0; pipe.generateFirst(); const dataFromStorage = storage.getStorageData(); bestScore = dataFromStorage?.bestScore || 0; };

const canvasClick = () => { if (p5.mouseButton === 'left') { if (!gameOver) bird?.jump(); if (!gameStart) gameStart = true; if (gameOver && p5.mouseX > CANVAS_WIDTH / 2 - 85 && p5.mouseX < CANVAS_WIDTH / 2 + 75 && p5.mouseY > CANVAS_HEIGHT / 2 + 100 && p5.mouseY < CANVAS_HEIGHT / 2 + 160) { resetGame(); } } };

p5.setup = () => { p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT); injectStyles(); createTopBarUI(); toggleWeb3UI(); resetGame(); const cvs = p5.canvas; if (cvs) cvs.addEventListener('touchstart', (e) => { e.preventDefault(); if (!gameOver) bird?.jump(); if (!gameStart) gameStart = true; }, { passive: false }); p5.canvas.addEventListener('mousedown', canvasClick); };

p5.draw = () => { if (backgroundImg && backgroundImg.width > 1) p5.image(backgroundImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); else p5.background(135,206,235);

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
    dieAudio.currentTime = 0; dieAudio.play();
    if (isWalletConnected && score > 0) setTimeout(() => { submitScoreToBlockchain(score); }, 700);
  }
  if (pipe.getScore(bird)) { score++; pointAudio.currentTime = 0; pointAudio.play(); }
} else {
  pipe.draw(); bird.draw(); floor.draw();
  if (gameOver) bird.update(); else floor.update();
}

if (!gameStart) gameText.startText();
if (gameOver) {
  if (score > bestScore) { bestScore = score; storage.setStorageData({ bestScore: score }); }
  gameText.gameOverText(score, bestScore, level);
  gameButton.resetButton();
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

p5.keyPressed = (e) => { if (e.key === ' ') { if (!gameOver) bird?.jump(); if (!gameStart) gameStart

