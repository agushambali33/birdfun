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

// Contract config (keep your contract address / ABI)
const CONTRACT_ADDRESS = '0xf83Ae7b7303346d003FEd85Ad07cd8e98F9eadC6';
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
        // if val is BigNumber or string/number
        return Number(ethers.utils.formatEther(val)).toFixed(2);
    } catch (e) {
        // fallback if not BigNumber
        try { return (Number(val) / 1e18).toFixed(2); } catch (e2) { return '0.00'; }
    }
};

// === WEB3 FUNCTIONS ===
const connectWallet = async () => {
    console.log('🔄 Starting wallet connection...');
    if (typeof window.ethereum !== 'undefined') {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.Web3Provider(window.ethereum);
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
                playerPoints = 0;
                rewardPreview = 0;
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
    // redeem on-chain
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

        // we assume contract moves points -> tokens; update local values
        const tokens = (pts / 10).toFixed(2);
        playerPoints = 0;
        rewardPreview = 0;

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
    // Connect toggle (left)
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

    // Points badge (right)
    if (pointsBadge) {
        const pts = getPointsNumber(playerPoints);
        pointsBadge.innerHTML = pts || 0;
        pointsBadge.className = pts > 0 ? 'badge active' : 'badge';
    }

    // Reward badge (right)
    if (rewardBadge) {
        const tokens = formatRewardPreview(rewardPreview);
        rewardBadge.innerHTML = `💎 ${tokens}`;
        // active class if tokens > 0
        rewardBadge.className = (Number(tokens) > 0) ? 'badge reward active' : 'badge reward';
    }

    // Claim toggle (show only when points > 0)
    if (claimToggle) {
        const pts = getPointsNumber(playerPoints);
        const canClaim = pts > 0;
        claimToggle.disabled = !canClaim;
        claimToggle.className = canClaim ? 'toggle claim active' : 'toggle claim disabled';
        claimToggle.innerHTML = canClaim ? '⚡ Claim' : '⚡ Locked';
        // animate visibility (opacity + translate)
        if (canClaim) {
            claimToggle.style.opacity = '1';
            claimToggle.style.transform = 'translateY(0)';
        } else {
            claimToggle.style.opacity = '0';
            claimToggle.style.transform = 'translateY(10px)';
        }
    }
};

// Compact UI Creation (keeps Connect left, Points/Reward right, Claim shown only when points)
const createCompactUI = () => {
    console.log('🎨 Creating compact UI...');

    // 1. TOP-LEFT: Connect Toggle (Always Visible)
    connectToggle = document.createElement('button');
    connectToggle.className = 'toggle';
    connectToggle.innerHTML = '🔗 Connect';
    connectToggle.style.cssText = `
        position: fixed;
        top: 15px;
        left: 15px;
        width: 110px;
        height: 36px;
        border-radius: 18px;
        border: none;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-family: 'FlappyBirdy', Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        z-index: 1001;
        box-shadow: 0 3px 10px rgba(102, 126, 234, 0.4);
        transition: all 0.2s ease-in-out;
    `;
    connectToggle.onclick = connectWallet;
    document.body.appendChild(connectToggle);

    // 2. TOP-RIGHT: Points & Reward Badges (Compact)
    const badgeContainer = document.createElement('div');
    badgeContainer.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        display: flex;
        gap: 8px;
        align-items: center;
        z-index: 1001;
    `;
    document.body.appendChild(badgeContainer);

    // Points Badge
    pointsBadge = document.createElement('div');
    pointsBadge.className = 'badge';
    pointsBadge.innerHTML = '0';
    pointsBadge.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(76, 175, 80, 0.2);
        border: 1px solid rgba(76, 175, 80, 0.4);
        color: #4CAF50;
        font-family: 'FlappyBirdy', Arial, sans-serif;
        font-size: 12px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
    `;
    badgeContainer.appendChild(pointsBadge);

    // Reward Badge
    rewardBadge = document.createElement('div');
    rewardBadge.className = 'badge reward';
    rewardBadge.innerHTML = '💎 0.00';
    rewardBadge.style.cssText = `
        width: 72px;
        height: 36px;
        border-radius: 18px;
        background: rgba(255, 215, 0, 0.15);
        border: 1px solid rgba(255, 215, 0, 0.3);
        color: #FFD700;
        font-family: 'FlappyBirdy', Arial, sans-serif;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(255, 215, 0, 0.2);
        transition: all 0.3s ease;
        backdrop-filter: blur(10px);
        letter-spacing: -0.5px;
    `;
    badgeContainer.appendChild(rewardBadge);

    // 3. BOTTOM-RIGHT: Claim Toggle (Hidden until points) - keep as your script
    claimToggle = document.createElement('button');
    claimToggle.className = 'toggle claim disabled';
    claimToggle.innerHTML = '⚡ Locked';
    claimToggle.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 72px;
        height: 32px;
        border-radius: 16px;
        border: none;
        background: rgba(158, 158, 158, 0.3);
        color: #9E9E9E;
        font-family: 'FlappyBirdy', Arial, sans-serif;
        font-size: 10px;
        font-weight: 600;
        cursor: not-allowed;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(158, 158, 158, 0.2);
        transition: all 0.3s ease;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: translateY(10px);
        backdrop-filter: blur(10px);
    `;
    claimToggle.onclick = redeemPoints;
    document.body.appendChild(claimToggle);

    // Add global styles
    addCompactStyles();

    // Initial state
    toggleWeb3UI();
    console.log('✅ Compact UI ready');
};

// Compact UI Styles (unchanged look)
const addCompactStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
        .toggle { transition: all 0.3s cubic-bezier(0.4,0,0.2,1); }
        .toggle.connected { background: linear-gradient(135deg,#4CAF50,#45a049) !important; box-shadow: 0 3px 12px rgba(76,175,80,0.4) !important; transform: scale(1.02); }
        .toggle:hover:not(.disabled) { transform: translateY(-1px) scale(1.02); box-shadow: 0 4px 16px rgba(102,126,234,0.4) !important; }
        .badge { transition: all 0.3s ease; }
        .badge.active { background: rgba(76,175,80,0.4) !important; border-color: #4CAF50 !important; box-shadow: 0 3px 12px rgba(76,175,80,0.3) !important; transform: scale(1.1); }
        .badge.reward.active { background: rgba(255,215,0,0.3) !important; border-color: #FFD700 !important; box-shadow: 0 0 12px rgba(255,215,0,0.4) !important; animation: rewardGlow 1.5s ease-in-out infinite alternate; }
        @keyframes rewardGlow { 0% { box-shadow: 0 0 8px rgba(255,215,0,0.4);} 100% { box-shadow: 0 0 16px rgba(255,215,0,0.6);} }
        .toggle.claim.active { background: linear-gradient(135deg,#2196F3,#1976D2) !important; color: white !important; cursor: pointer !important; box-shadow: 0 3px 12px rgba(33,150,243,0.4) !important; opacity: 1 !important; transform: translateY(0) scale(1); }
        .toggle.claim.active:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 5px 20px rgba(33,150,243,0.5) !important; }
        .toggle.claim.disabled { background: rgba(158,158,158,0.2) !important; color: #9E9E9E !important; cursor: not-allowed !important; }
        .toast { position: fixed; top: 80px; right: 15px; background: rgba(0,0,0,0.9); backdrop-filter: blur(10px); border-radius:12px; padding:8px 12px; font-size:11px; font-weight:500; z-index:1002; min-width:140px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); border-left:3px solid; opacity:0; transform:translateX(100%); transition: all 0.3s ease; display:flex; align-items:center; gap:6px; }
        .toast.show { opacity:1; transform:translateX(0); }
        .toast.success { border-left-color:#4CAF50; color:#4CAF50; } .toast.error { border-left-color:#f44336; color:#f44336; } .toast.warning { border-left-color:#ff9800; color:#ff9800; } .toast.loading { border-left-color:#9E9E9E; color:#9E9E9E; }
        .toast .icon { font-size:12px; min-width:12px; }
    `;
    document.head.appendChild(style);
};

// Toast notifications - Compact
const showToast = (message, type = 'info') => {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="icon">${getToastIcon(type)}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2500);
};

const getToastIcon = (type) => {
    const icons = { success:'✅', error:'❌', warning:'⚠️', loading:'⏳' };
    return icons[type] || 'ℹ️';
};

// Animations
const animateConnectSuccess = () => { if (connectToggle) { connectToggle.style.transform = 'scale(0.95)'; setTimeout(() => connectToggle.style.transform = 'scale(1)', 150); } };
const animateScorePulse = (element, score) => { if (!element) return; element.style.transform='scale(1.3)'; element.style.color='#FFD700'; setTimeout(()=>{ element.style.transform='scale(1)'; element.style.color='#4CAF50'; }, 200); };
const animateClaimSuccess = () => { if (pointsBadge) { pointsBadge.style.transform='scale(0.8)'; pointsBadge.style.background='rgba(255,215,0,0.3)'; setTimeout(()=>{ pointsBadge.style.transform='scale(1)'; pointsBadge.style.background='rgba(76,175,80,0.2)'; },200); } };

// ========================= GAME LOOP (p5) =========================
const sketch = p5 => {
    let background = p5.loadImage(BackgroundImage);
    let spriteImage = p5.loadImage(Images);
    let birdyFont = p5.loadFont(font);
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

        // Create compact UI
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
                    setTimeout(() => submitScoreToBlockchain(score), 1000);
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

        // Keep UI synchronized (in case playerPoints/rewardPreview changed elsewhere)
        // (toggleWeb3UI already called on web3 events, but a safe refresh won't hurt)
        // do not spam calls — only update occasionally: update every 60 frames
        if (p5.frameCount % 60 === 0) toggleWeb3UI();
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