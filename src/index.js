// index.js (UPGRADE untuk V4 HBIRD & Debug Full)
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

/* ===== CONFIG ===== */
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;
const HELIOS_CHAIN_ID_HEX = ethers.utils.hexValue(HELIOS_CHAIN_ID);

const CONTRACT_ADDRESS = '0xb9ccd00c2016444f58e2492117b49da317f4899b'; // HBIRD V4
const VOUCHER_ENDPOINT = 'https://birdfunbackend.vercel.app/api/sign';
const CONTRACT_ABI = [
  "function claimReward(uint256 amount,uint256 nonce,uint256 expiry,bytes signature) external",
  "function getPoolBalance() external view returns (uint256)",
  "function usedNonces(address player, uint256 nonce) external view returns (bool)"
];

/* ===== PROVIDERS & CONTRACTS ===== */
let provider = null;
let signer = null;
let contract = null;
const contractReadOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, new ethers.providers.JsonRpcProvider(HELIOS_RPC));

/* ===== STATE ===== */
let isWalletConnected = false;
let playerAddress = null;
let playerScore = 0; 
let rewardPreview = ethers.BigNumber.from(0);

/* ===== UI ELEMENTS ===== */
let topBar, connectToggle, pointsBadge, rewardBadge, claimToggle;

/* ===== HELPERS ===== */
const formatReward = (points) => {
  try {
    return ethers.utils.formatUnits(ethers.BigNumber.from(points).mul(ethers.BigNumber.from(10).pow(18)), 18);
  } catch {
    return "0.00";
  }
};

const logDebug = (msg) => console.log(`[DEBUG] ${new Date().toISOString()} ${msg}`);

/* ===== TOAST ===== */
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

/* ===== WEB3 ===== */
async function connectWallet(silent = false) {
  if (!window.ethereum) {
    if (!silent) showToast('Please install MetaMask!', 'error');
    return false;
  }
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HELIOS_CHAIN_ID_HEX }]
    }).catch(async (err) => {
      if (err.code === 4902) {
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
      }
    });

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (accounts.length === 0) return false;

    provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    signer = provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    playerAddress = accounts[0];
    isWalletConnected = !!playerAddress;

    window.ethereum.on('accountsChanged', autoConnectWallet);
    window.ethereum.on('chainChanged', autoConnectWallet);

    toggleWeb3UI();
    showToast('Wallet connected', 'success');
    logDebug(`Wallet connected: ${playerAddress}`);
    return true;
  } catch (err) {
    console.error(err);
    if (!silent) showToast(err?.message || 'Connect failed', 'error');
    return false;
  }
}

async function autoConnectWallet() { await connectWallet(true); }

async function ensureWalletConnected() {
  if (!isWalletConnected || !contract || !signer || !playerAddress) {
    return await connectWallet(true);
  }
  return true;
}

async function getNextNonce() {
  let nonce = 1;
  try {
    while (await contractReadOnly.usedNonces(playerAddress, nonce)) nonce++;
  } catch (err) {
    logDebug(`AutoNonce error: ${err.message}`);
  }
  logDebug(`Next nonce for ${playerAddress}: ${nonce}`);
  return nonce;
}

async function claimReward() {
  if (playerScore <= 0) {
    showToast('No points to claim', 'warning');
    return;
  }
  try {
    const connected = await ensureWalletConnected();
    if (!connected) return;

    showToast('Fetching voucher...', 'loading');
    const nonce = await getNextNonce();
    const url = `${VOUCHER_ENDPOINT}?player=${playerAddress}&amount=${playerScore}&nonce=${nonce}&contractAddress=${CONTRACT_ADDRESS}`;
    const res = await fetch(url);
    const voucher = await res.json();
    logDebug(`Voucher response: ${JSON.stringify(voucher)}`);

    if (!voucher.success) {
      showToast('Voucher fetch failed', 'error');
      return;
    }

    showToast('Sending transaction...', 'loading');
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

    playerScore = 0;
    toggleWeb3UI();
    showToast('Reward claimed!', 'success');
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Claim failed', 'error');
  }
}

/* ===== UI ===== */
function injectStyles() {
  const s = document.createElement('style');
  s.innerHTML = `
    /* same styles as before for top bar, badges, claim button, toast */
  `;
  document.head.appendChild(s);
}

function createTopBarUI() {
  if (document.getElementById('game-topbar')) return;
  topBar = document.createElement('div'); topBar.id = 'game-topbar';
  connectToggle = document.createElement('button'); connectToggle.className = 'g-toggle'; connectToggle.innerText = '🦊 Connect Wallet';
  connectToggle.onclick = () => connectWallet();
  topBar.appendChild(connectToggle); document.body.appendChild(topBar);

  const web3Info = document.createElement('div'); web3Info.id = 'web3-info';
  pointsBadge = document.createElement('div'); pointsBadge.className = 'g-badge points'; pointsBadge.innerText = '🏆 Score: 0';
  rewardBadge = document.createElement('div'); rewardBadge.className = 'g-badge reward'; rewardBadge.innerText = '0.00';
  claimToggle = document.createElement('button'); claimToggle.id = 'claim-btn'; claimToggle.innerText = 'Claim';
  claimToggle.onclick = claimReward; claimToggle.disabled = true;
  web3Info.append(pointsBadge, rewardBadge, claimToggle); document.body.appendChild(web3Info);
}

function toggleWeb3UI() {
  if (connectToggle) {
    connectToggle.innerText = (isWalletConnected && playerAddress) ? `✅ ${playerAddress.slice(0,4)}...${playerAddress.slice(-4)}` : '🦊 Connect Wallet';
    connectToggle.classList.toggle('connected', isWalletConnected);
  }
  if (pointsBadge) pointsBadge.innerText = `🏆 Score: ${playerScore}`;
  if (rewardBadge) rewardBadge.innerText = `${formatReward(playerScore)}`;
  if (claimToggle) claimToggle.disabled = !(isWalletConnected && playerScore > 0);
}

/* ===== P5 GAME ===== */
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
    gameButton = new Button(p5, gameText, spriteImage); storage = new Storage();
    score = 0; pipe.generateFirst(); toggleWeb3UI();
  };

  const handleInput = () => { if (!gameOver) bird?.jump(); if (!gameStart) gameStart = true; };

  p5.setup = () => {
    p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT); p5.frameRate(60);
    injectStyles(); createTopBarUI(); toggleWeb3UI(); autoConnectWallet(); resetGame();
    p5.canvas.addEventListener('touchstart', e => { e.preventDefault(); handleInput(); }, { passive:false });
    p5.canvas.addEventListener('mousedown', e => { handleInput(); });
  };

  p5.draw = () => {
    if (backgroundImg) p5.image(backgroundImg,0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    if (gameStart && !gameOver) { pipe.move(Math.floor(score/10)); pipe.draw(); bird.update(); bird.draw(); floor.update(); floor.draw(); gameOver = pipe.checkCrash(bird) || bird.isDead(); if (gameOver) { playerScore += score; toggleWeb3UI(); dieAudio.play(); } if(pipe.getScore(bird)){ score++; pointAudio.play(); } } 
    else { pipe.draw(); bird.draw(); floor.update(); floor.draw(); }
  };

  p5.keyPressed = e => { if(e.key===' '){ if(!gameOver) bird?.jump(); if(!gameStart) gameStart=true; } if(e.key==='r'&&gameOver) resetGame(); };
};

new P5(sketch, 'Game');