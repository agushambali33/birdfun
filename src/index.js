// index.js (FULL FINAL V5)
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

const CONTRACT_ADDRESS = '0xb9ccd00c2016444f58e2492117b49da317f4899b'; // V5
const VOUCHER_ENDPOINT = 'https://birdfunbackend.vercel.app/api/sign';
const CONTRACT_ABI = [
  "function claimReward(uint256 amount,uint256 nonce,uint256 expiry,bytes signature) external",
  "function getPoolBalance() external view returns (uint256)",
  "function lastNonce(address player) external view returns (uint256)",
  "function lastClaim(address player) external view returns (uint256)",
  "event RewardClaimed(address indexed player, uint256 amount, uint256 nonce)"
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
let playerScore = 0;
let rewardPreview = ethers.BigNumber.from(0);

/* ====== UI ELEMENTS ====== */
let topBar, connectToggle, scoreBox, claimToggle, toggleLeaderboard, leaderboardDiv;

/* ====== HELPERS ====== */
const formatReward = (points) => {
  try {
    return ethers.utils.formatUnits(
      ethers.BigNumber.from(points).mul(ethers.BigNumber.from(5).mul(ethers.BigNumber.from(10).pow(17))),
      18
    );
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

/* ====== LOCAL STORAGE PER WALLET ====== */
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
  }
}

/* ====== LEADERBOARD ====== */
async function fetchLeaderboard() {
  try {
    const filter = contractReadOnly.filters.RewardClaimed();
    const logs = await providerReadonly.getLogs({ ...filter, fromBlock: 0 });
    const leaderboard = logs.reduce((acc, log) => {
      const { player, amount } = contractReadOnly.interface.parseLog(log).args;
      const key = player.toLowerCase();
      acc[key] = (acc[key] || 0) + parseFloat(ethers.utils.formatUnits(amount, 18));
      return acc;
    }, {});
    const topPlayers = Object.entries(leaderboard)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([address, hbird]) => ({ address: `${address.slice(0, 4)}...${address.slice(-4)}`, hbird: hbird.toFixed(2) }));
    return topPlayers;
  } catch (err) {
    logDebug(`Leaderboard error: ${err.message}`);
    return [];
  }
}

/* ====== POOL BALANCE ====== */
async function checkPoolBalance() {
  try {
    const balance = await contractReadOnly.getPoolBalance();
    return parseFloat(ethers.utils.formatUnits(balance, 18)).toFixed(2);
  } catch (err) {
    logDebug(`Pool balance error: ${err.message}`);
    return "0.00";
  }
}

/* ====== WEB3 ACTIONS ====== */
async function connectWallet(silent = false) {
  if (typeof window.ethereum === 'undefined') {
    if (!silent) showToast('Please install MetaMask!', 'error');
    return false;
  }
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HELIOS_CHAIN_ID_HEX }]
    }).catch(async switchErr => {
      if (switchErr.code === 4902) {
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
      } else if (!silent) throw switchErr;
    });

    const accounts = silent 
      ? await window.ethereum.request({ method: 'eth_accounts' }) 
      : await window.ethereum.request({ method: 'eth_requestAccounts' });

    if (!accounts.length) {
      if (!silent) showToast('No accounts found', 'error');
      return false;
    }

    provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    signer = provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    playerAddress = accounts[0].toLowerCase();
    isWalletConnected = true;

    loadPlayerScore();
    toggleWeb3UI();
    if (!silent) showToast('Wallet connected', 'success');

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
    console.error(err);
    if (!silent) showToast('Connect failed: ' + (err?.message || 'unknown'), 'error');
    return false;
  }
}

async function autoConnectWallet() { await connectWallet(true); }
async function ensureWalletConnected() {
  if (!isWalletConnected || !contract || !signer || !playerAddress) {
    const connected = await connectWallet(true);
    if (!connected) { showToast('Please reconnect wallet', 'error'); return false; }
  }
  try { await signer.getAddress(); return true; } catch { await connectWallet(true); return !!isWalletConnected; }
}

async function getNextNonce() {
  try {
    const last = await contractReadOnly.lastNonce(playerAddress);
    return last.toNumber() + 1;
  } catch {
    return 1;
  }
}

async function redeemPoints() {
  if (playerScore <= 0) { showToast('No points to claim', 'warning'); return; }
  const connected = await ensureWalletConnected();
  if (!connected) return;
  try {
    const nonce = await getNextNonce();
    const response = await fetch(`${VOUCHER_ENDPOINT}?player=${playerAddress}&amount=${playerScore}&nonce=${nonce}&contractAddress=${CONTRACT_ADDRESS}`);
    const voucher = await response.json();
    if (!voucher.success) { showToast('Failed to get token voucher', 'error'); return; }

    const tx = await contract.claimReward(voucher.amountWei, voucher.nonce, voucher.expiry, voucher.signature, { gasLimit: 500000 });
    await tx.wait();
    playerScore = 0;
    savePlayerScore();
    toggleWeb3UI();
    showToast(`Token claimed!`, 'success');
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Claim failed', 'error');
  }
}

/* ====== UI ====== */
function injectStyles() {
  const s = document.createElement('style');
  s.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap');
    #game-topbar { position: fixed; top: 5px; left: 5px; display: flex; flex-direction: column; gap: 4px; z-index: 9999; }
    .g-toggle { height: 24px; padding: 0 8px; border-radius: 10px; border: 2px solid #fff; background: linear-gradient(135deg,#00CED1,#20B2AA); color:#fff; font-size:8px; font-weight:700; cursor:pointer; }
    .g-toggle.connected { background: linear-gradient(135deg,#32CD32,#228B22); }
    #score-box { padding:4px 6px; border-radius:8px; background:rgba(0,0,0,0.7); color:#fff; font-size:9px; font-weight:600; display:flex; flex-direction:column; gap:2px; max-width:180px; }
    #claim-btn { height:24px; padding:0 8px; border-radius:10px; border:2px solid #fff; background:linear-gradient(135deg,#FFD54F,#FF8A00); color:#000; font-weight:700; font-size:9px; cursor:pointer; }
    #claim-btn[disabled] { opacity:0.55; cursor:not-allowed; }
    #leaderboard { position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.8); border-radius:8px; padding:6px; max-width:180px; z-index:9999; font-family:'Press Start 2P'; color:#fff; font-size:8px; line-height:1.3; max-height:100px; overflow-y:auto; }
    .game-toast { position:fixed; top:80px; right:10px; background:rgba(0,0,0,0.9); color:#fff; padding:6px 10px; border-radius:6px; font-family:'Press Start 2P'; font-size:9px; max-width:180px; line-height:1.2; z-index:10000; }
  `;
  document.head.appendChild(s);
}

function createTopBarUI() {
  if (document.getElementById('game-topbar')) return;
  topBar = document.createElement('div'); topBar.id = 'game-topbar';

  connectToggle = document.createElement('button'); connectToggle.className = 'g-toggle'; connectToggle.innerText = '🦊 Connect Wallet';
  connectToggle.onclick = () => connectWallet();
  topBar.appendChild(connectToggle); document.body.appendChild(topBar);

  scoreBox = document.createElement('div'); scoreBox.id = 'score-box';
  scoreBox.innerHTML = `<div>🏆 Score: 0</div><div>Hbird: 0.00</div><div>Pool = 0.00</div>`;
  document.body.appendChild(scoreBox);

  claimToggle = document.createElement('button'); claimToggle.id = 'claim-btn'; claimToggle.innerText = 'Claim'; claimToggle.onclick = redeemPoints; claimToggle.disabled = true;
  document.body.appendChild(claimToggle);

  toggleLeaderboard = document.createElement('button'); toggleLeaderboard.className = 'g-toggle'; toggleLeaderboard.innerText = 'Hide Leaderboard';
  toggleLeaderboard.onclick = () => { leaderboardDiv.style.display = leaderboardDiv.style.display==='none'?'block':'none'; toggleLeaderboard.innerText=leaderboardDiv.style.display==='none'?'Show Leaderboard':'Hide Leaderboard'; };
  document.body.appendChild(toggleLeaderboard);

  leaderboardDiv = document.createElement('div'); leaderboardDiv.id='leaderboard'; leaderboardDiv.innerText='🏅 Leaderboard: Loading...';
  document.body.appendChild(leaderboardDiv);
}

async function toggleWeb3UI() {
  if (connectToggle) connectToggle.innerText = (isWalletConnected && playerAddress)?`✅ ${playerAddress.slice(0,4)}...${playerAddress.slice(-4)}`:'🦊 Connect Wallet';
  if (scoreBox) {
    scoreBox.children[0].innerText = `🏆 Score: ${playerScore}`;
    scoreBox.children[1].innerText = `Hbird: ${formatReward(playerScore)}`;
    scoreBox.children[2].innerText = `Pool = ${await checkPoolBalance()}`;
  }
  if (claimToggle) claimToggle.disabled = !(isWalletConnected && playerScore>0);
  if (leaderboardDiv) {
    const topPlayers = await fetchLeaderboard();
    leaderboardDiv.innerHTML = topPlayers.length>0 ? topPlayers.map(p=>`<div>🏅 ${p.address}: ${p.hbird}</div>`).join('') : '🏅 No claims yet';
  }
}

/* ====== P5 GAME ====== */
const sketch = p5 => {
  let backgroundImg, spriteImage, birdyFont;
  let gameStart, gameOver, bird, pipe, floor, gameButton, gameText, score, storage, bestScore;

  p5.preload = () => { spriteImage=p5.loadImage(Images); backgroundImg=p5.loadImage(BackgroundImage); birdyFont=p5.loadFont(fontFile); storage=new Storage(); const sd=storage.getStorageData()||{bestScore:0}; bestScore=sd.bestScore||0; };

  const resetGame = () => { gameStart=false; gameOver=false; bird=new Bird(p5,spriteImage); pipe=new Pipe(p5,spriteImage); floor=new Floor(p5,spriteImage); gameText=new Text(p5,birdyFont); gameButton=new Button(p5,gameText,spriteImage); score=0; pipe.generateFirst(); toggleWeb3UI(); };

  const handleInput = () => { if(!gameOver) bird?.jump(); if(!gameStart) gameStart=true; if(gameOver && p5.mouseX>CANVAS_WIDTH/2-85 && p5.mouseX<CANVAS_WIDTH/2+75 && p5.mouseY>CANVAS_HEIGHT/2+100 && p5.mouseY<CANVAS_HEIGHT/2+160) resetGame(); };

  p5.setup = () => { p5.createCanvas(CANVAS_WIDTH,CANVAS_HEIGHT); p5.frameRate(60); injectStyles(); createTopBarUI(); toggleWeb3UI(); autoConnectWallet(); setInterval(toggleWeb3UI,30000); resetGame(); p5.canvas.addEventListener('touchstart',e=>{e.preventDefault();handleInput();},{passive:false}); p5.canvas.addEventListener('mousedown',e=>{handleInput();}); };

  p5.draw = () => {
    if(backgroundImg) p5.image(backgroundImg,0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    const level=Math.floor(score/10);
    if(gameStart&&!gameOver){
      pipe.move(level); pipe.draw(); bird.update(); bird.draw(); floor.update(); floor.draw();
      gameOver=pipe.checkCrash(bird)||bird.isDead();
      if(gameOver){ dieAudio.currentTime=0; dieAudio.play(); playerScore+=score; savePlayerScore(); toggleWeb3UI(); }
      if(pipe.getScore(bird)){ score++; pointAudio.currentTime=0; pointAudio.play(); }
    }else{ pipe.draw(); bird.draw(); floor.draw(); if(gameOver) bird.update(); else floor.update(); }
    if(!gameStart) gameText.startText();
    if(gameOver){ if(score>bestScore){ bestScore=score; storage.setStorageData({bestScore:score}); } gameText.gameOverText(score,bestScore,level); gameButton.resetButton(); }
    else gameText.scoreText(score,level);
  };

  p5.keyPressed = e => { if(e.key===' '){ if(!gameOver) bird?.jump(); if(!gameStart) gameStart=true; } if(e.key==='r'&&gameOver) resetGame(); };
};

new P5(sketch,'Game');