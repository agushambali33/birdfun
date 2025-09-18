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

// Contract config
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

// Web3 functions - Unchanged
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
        alert('Failed to connect wallet: ' + error.message);  
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
    const receipt = await tx.wait();  
      
    playerPoints = await contract.playerPoints(playerAddress);  
    rewardPreview = await contract.getRewardPreview(playerAddress);  
      
    toggleWeb3UI();  
    showToast(`+${score} points!`, 'success');  
    animateScorePulse(pointsBadge, score);  
      
    return true;  
} catch (error) {  
    console.error('❌ Submit error:', error);  
    let msg = 'Submit failed: ';  
    if (error.code === 4001) msg += 'Cancelled';  
    else if (error.message.includes('insufficient funds')) msg += 'Low ETH';  
    else msg += error.message;  
    showToast(msg, 'error');  
    return false;  
}

};

const redeemPoints = async () => {
if (!isWalletConnected || !contract || playerPoints === 0) {
showToast('No points to claim!', 'warning');
return;
}

try {  
    showToast('Claiming tokens...', 'loading');  
    const tx = await contract.redeem({ gasLimit: 300000 });  
    const receipt = await tx.wait();  
      
    const tokens = (playerPoints / 10).toFixed(2);  
    playerPoints = 0;  
    rewardPreview = 0;  
      
    toggleWeb3UI();  
    showToast(`Claimed ${tokens} tokens! 🎉`, 'success');  
    animateClaimSuccess();  
      
} catch (error) {  
    console.error('❌ Redeem error:', error);  
    let msg = 'Claim failed: ';  
    if (error.message.includes('No points')) msg += 'No points';  
    else if (error.code === 4001) msg += 'Cancelled';  
    else msg += error.message;  
    showToast(msg, 'error');  
}

};

// Compact UI Toggle
const toggleWeb3UI = () => {
// Connect toggle
if (connectToggle) {
if (isWalletConnected) {
connectToggle.innerHTML = '✅ Connected';
connectToggle.className = 'toggle connected';
} else {
connectToggle.innerHTML = '🔗 Connect';
connectToggle.className = 'toggle';
}
}

// Points badge  
if (pointsBadge) {  
    pointsBadge.innerHTML = playerPoints || 0;  
    pointsBadge.className = playerPoints > 0 ? 'badge active' : 'badge';  
}  
  
// Reward badge  
if (rewardBadge) {  
    const tokens = (rewardPreview / 1e18).toFixed(2);  
    rewardBadge.innerHTML = `💎 ${tokens}`;  
    rewardBadge.className = tokens > 0 ? 'badge reward active' : 'badge reward';  
}  
  
// Claim toggle  
if (claimToggle) {  
    const canClaim = playerPoints > 0;  
    claimToggle.disabled = !canClaim;  
    claimToggle.className = canClaim ? 'toggle claim active' : 'toggle claim disabled';  
    claimToggle.innerHTML = canClaim ? '⚡ Claim' : '⚡ Locked';  
}

};

// Compact UI Creation
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
    width: 80px;  
    height: 32px;  
    border-radius: 16px;  
    border: none;  
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);  
    color: white;  
    font-size: 11px;  
    font-weight: 600;  
    cursor: pointer;  
    z-index: 1001;  
    box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);  
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);  
    letter-spacing: 0.5px;  
    display: flex;  
    align-items: center;  
    justify-content: center;  
    backdrop-filter: blur(10px);  
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
    width: 52px;  
    height: 36px;  
    border-radius: 18px;  
    background: rgba(255, 215, 0, 0.15);  
    border: 1px solid rgba(255, 215, 0, 0.3);  
    color: #FFD700;  
    font-size: 10px;  
    font-weight: 600;  
    display: flex;  
    align-items: center;  
    justify-content: center;  
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.2);  
    transition: all 0.3s ease;  
    backdrop-filter: blur(10px);  
    letter-spacing: -0.5px;  
`;  
badgeContainer.appendChild(rewardBadge);  
  
// 3. BOTTOM-RIGHT: Claim Toggle (Hidden until points)  
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

// Compact UI Styles
const addCompactStyles = () => {
const style = document.createElement('style');
style.textContent = `
.toggle {
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle.connected {  
        background: linear-gradient(135deg, #4CAF50, #45a049) !important;  
        box-shadow: 0 3px 12px rgba(76, 175, 80, 0.4) !important;  
        transform: scale(1.02);  
    }  
      
    .toggle:hover:not(.disabled) {  
        transform: translateY(-1px) scale(1.02);  
        box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4) !important;  
    }  
      
    .badge {  
        transition: all 0.3s ease;  
    }  
      
    .badge.active {  
        background: rgba(76, 175, 80, 0.4) !important;  
        border-color: #4CAF50 !important;  
        box-shadow: 0 3px 12px rgba(76, 175, 80, 0.3) !important;  
        transform: scale(1.1);  
    }  
      
    .badge.reward.active {  
        background: rgba(255, 215, 0, 0.3) !important;  
        border-color: #FFD700 !important;  
        box-shadow: 0 0 12px rgba(255, 215, 0, 0.4) !important;  
        animation: rewardGlow 1.5s ease-in-out infinite alternate;  
    }  
      
    @keyframes rewardGlow {  
        0% { box-shadow: 0 0 8px rgba(255, 215, 0, 0.4); }  
        100% { box-shadow: 0 0 16px rgba(255, 215, 0, 0.6); }  
    }  
      
    .toggle.claim.active {  
        background: linear-gradient(135deg, #2196F3, #1976D2) !important;  
        color: white !important;  
        cursor: pointer !important;  
        box-shadow: 0 3px 12px rgba(33, 150, 243, 0.4) !important;  
        opacity: 1 !important;  
        transform: translateY(0) scale(1);  
    }  
      
    .toggle.claim.active:hover {  
        transform: translateY(-2px) scale(1.02);  
        box-shadow: 0 5px 20px rgba(33, 150, 243, 0.5) !important;  
    }  
      
    .toggle.claim.disabled {  
        background: rgba(158, 158, 158, 0.2) !important;  
        color: #9E9E9E !important;  
        cursor: not-allowed !important;  
    }  
      
    /* Toast notifications - Compact */  
    .toast {  
        position: fixed;  
        top: 80px;  
        right: 15px;  
        background: rgba(0, 0, 0, 0.9);  
        backdrop-filter: blur(10px);  
        border-radius: 12px;  
        padding: 8px 12px;  
        font-size: 11px;  
        font-weight: 500;  
        z-index: 1002;  
        min-width: 140px;  
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);  
        border-left: 3px solid;  
        opacity: 0;  
        transform: translateX(100%);  
        transition: all 0.3s ease;  
        display: flex;  
        align-items: center;  
        gap: 6px;  
    }  
      
    .toast.show {  
        opacity: 1;  
        transform: translateX(0);  
    }  
      
    .toast.success { border-left-color: #4CAF50; color: #4CAF50; }  
    .toast.error { border-left-color: #f44336; color: #f44336; }  
    .toast.warning { border-left-color: #ff9800; color: #ff9800; }  
    .toast.loading { border-left-color: #9E9E9E; color: #9E9E9E; }  
      
    .toast .icon { font-size: 12px; min-width: 12px; }  
`;  
document.head.appendChild(style);

};

// Toast notifications - Compact
const showToast = (message, type = 'info') => {
const existingToast = document.querySelector('.toast');
if (existingToast) existingToast.remove();

const toast = document.createElement('div');  
toast.className = `toast ${type}`;  
toast.innerHTML = `  
    <span class="icon">${getToastIcon(type)}</span>  
    <span>${message}</span>  
`;  
  
document.body.appendChild(toast);  
  
// Animate in  
setTimeout(() => toast.classList.add('show'), 10);  
  
// Auto remove  
setTimeout(() => {  
    toast.classList.remove('show');  
    setTimeout(() => toast.remove(), 300);  
}, 2500);

};

const getToastIcon = (type) => {
const icons = {
success: '✅',
error: '❌',
warning: '⚠️',
loading: '⏳'
};
return icons[type] || 'ℹ️';
};

// Animations
const animateConnectSuccess = () => {
if (connectToggle) {
connectToggle.style.transform = 'scale(0.95)';
setTimeout(() => connectToggle.style.transform = 'scale(1)', 150);
}
};

const animateScorePulse = (element, score) => {
if (!element) return;
element.style.transform = 'scale(1.3)';
element.style.color = '#FFD700';
setTimeout(() => {
element.style.transform = 'scale(1)';
element.style.color = '#4CAF50';
}, 200);
};

const animateClaimSuccess = () => {
if (pointsBadge) {
pointsBadge.style.transform = 'scale(0.8)';
pointsBadge.style.background = 'rgba(255, 215, 0, 0.3)';
setTimeout(() => {
pointsBadge.style.transform = 'scale(1)';
pointsBadge.style.background = 'rgba(76, 175, 80, 0.2)';
}, 200);
}
};

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

    if (!gameStart) {  
        gameText.startText();  
    }  

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

}

new P5(sketch, 'Game');

