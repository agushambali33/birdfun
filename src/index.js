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

// DOM elements
let connectToggle, pointsBadge, rewardBadge, claimToggle;

// ========================= WEB3 FUNCTIONS =========================
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
        await tx.wait();
        
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
        await tx.wait();
        
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

// ========================= UI FUNCTIONS =========================
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

// Redesigned UI
const createCompactUI = () => {
    console.log('🎨 Creating game-style UI...');
    
    // === CONNECT WALLET (TOP LEFT) ===
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
        font-family: 'FlappyBirdy', sans-serif;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        z-index: 1001;
        box-shadow: 0 3px 10px rgba(102, 126, 234, 0.4);
        transition: all 0.2s ease-in-out;
    `;
    connectToggle.onclick = connectWallet;
    document.body.appendChild(connectToggle);
    
    // === RIGHT TOP STACK ===
    const badgeContainer = document.createElement('div');
    badgeContainer.style.cssText = `
        position: fixed;
        top: 15px;
        right: 15px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        z-index: 1001;
    `;
    document.body.appendChild(badgeContainer);

    // POINT BADGE
    pointsBadge = document.createElement('div');
    pointsBadge.className = 'badge';
    pointsBadge.innerHTML = '0';
    pointsBadge.style.cssText = `
        min-width: 70px;
        padding: 6px 10px;
        border-radius: 14px;
        background: rgba(76, 175, 80, 0.2);
        border: 1px solid rgba(76, 175, 80, 0.4);
        color: #4CAF50;
        font-family: 'FlappyBirdy', sans-serif;
        font-size: 15px;
        font-weight: bold;
        text-align: center;
        box-shadow: 0 2px 6px rgba(76, 175, 80, 0.25);
    `;
    badgeContainer.appendChild(pointsBadge);

    // TOKEN BADGE
    rewardBadge = document.createElement('div');
    rewardBadge.className = 'badge reward';
    rewardBadge.innerHTML = '💎 0.00';
    rewardBadge.style.cssText = `
        min-width: 80px;
        padding: 6px 12px;
        border-radius: 14px;
        background: rgba(255, 215, 0, 0.15);
        border: 1px solid rgba(255, 215, 0, 0.3);
        color: #FFD700;
        font-family: 'FlappyBirdy', sans-serif;
        font-size: 14px;
        font-weight: bold;
        text-align: center;
        box-shadow: 0 2px 6px rgba(255, 215, 0, 0.25);
    `;
    badgeContainer.appendChild(rewardBadge);

    // CLAIM BUTTON
    claimToggle = document.createElement('button');
    claimToggle.className = 'toggle claim disabled';
    claimToggle.innerHTML = '⚡ Locked';
    claimToggle.style.cssText = `
        margin-top: 6px;
        width: 100px;
        height: 36px;
        border-radius: 18px;
        border: none;
        background: rgba(158, 158, 158, 0.3);
        color: #9E9E9E;
        font-family: 'FlappyBirdy', sans-serif;
        font-size: 14px;
        font-weight: bold;
        cursor: not-allowed;
        box-shadow: 0 2px 6px rgba(158, 158, 158, 0.25);
        transition: all 0.2s ease;
        text-align: center;
    `;
    claimToggle.onclick = redeemPoints;
    badgeContainer.appendChild(claimToggle);

    addCompactStyles();
    toggleWeb3UI();
    console.log('✅ Game-style UI ready');
};

// ========================= STYLES =========================
const addCompactStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
        .toggle.connected {
            background: linear-gradient(135deg, #4CAF50, #45a049) !important;
            box-shadow: 0 3px 12px rgba(76, 175, 80, 0.4) !important;
            transform: scale(1.02);
        }
        
        .toggle:hover:not(.disabled) {
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 4px 16px rgba(102, 126, 234, 0.5) !important;
        }

        .badge.active {
            background: rgba(76, 175, 80, 0.4) !important;
            border-color: #4CAF50 !important;
            transform: scale(1.05);
        }
        
        .badge.reward.active {
            background: rgba(255, 215, 0, 0.3) !important;
            border-color: #FFD700 !important;
            animation: rewardGlow 1.2s ease-in-out infinite alternate;
        }
        
        @keyframes rewardGlow {
            0% { box-shadow: 0 0 6px rgba(255, 215, 0, 0.4); }
            100% { box-shadow: 0 0 14px rgba(255, 215, 0, 0.7); }
        }
        
        .toggle.claim.active {
            background: linear-gradient(135deg, #2196F3, #1976D2) !important;
            color: white !important;
            cursor: pointer !important;
            box-shadow: 0 3px 12px rgba(33, 150, 243, 0.4) !important;
        }
        
        .toggle.claim.active:hover {
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 5px 18px rgba(33, 150, 243, 0.6) !important;
        }
    `;
    document.head.appendChild(style);
};

// ========================= TOAST =========================
const showToast = (message, type = 'info') => {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    
    Object.assign(toast.style, {
        position: 'fixed',
        top: '70px',
        right: '20px',
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        fontFamily: 'FlappyBirdy, sans-serif',
        fontSize: '14px',
        padding: '8px 14px',
        borderRadius: '12px',
        zIndex: 1002,
        opacity: 0,
        transform: 'translateX(100%)',
        transition: 'all 0.3s ease'
    });
    
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = 1; toast.style.transform = 'translateX(0)'; }, 10);
    setTimeout(() => { toast.style.opacity = 0; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, 2200);
};

// ========================= ANIMATIONS =========================
const animateConnectSuccess = () => {
    if (connectToggle) {
        connectToggle.style.transform = 'scale(0.9)';
        setTimeout(() => connectToggle.style.transform = 'scale(1)', 150);
    }
};
const animateScorePulse = (element) => {
    if (!element) return;
    element.style.transform = 'scale(1.3)';
    setTimeout(() => element.style.transform = 'scale(1)', 200);
};
const animateClaimSuccess = () => {
    if (pointsBadge) {
        pointsBadge.style.transform = 'scale(0.8)';
        setTimeout(() => pointsBadge.style.transform = 'scale(1)', 200);
    }
};

// ========================= GAME LOOP =========================
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
        bestScore = storage.getStorageData()?.bestScore || 0;
    };

    const canvasClick = () => {
        if (p5.mouseButton === 'left') {
            if (!gameOver) bird?.jump();
            if (!gameStart) gameStart = true;
            if (gameOver && p5.mouseX > CANVAS_WIDTH / 2 - 85 && p5.mouseX < CANVAS_WIDTH / 2 + 75 &&
                p5.mouseY > CANVAS_HEIGHT / 2 + 100 && p5.mouseY < CANVAS_HEIGHT / 2 + 160
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
    };

    p5.keyPressed = (e) => {
        if (e.key === ' ') {
            if (!gameOver) bird?.jump();
            if (!gameStart) gameStart = true;
        }
        if (e.key === 'r' && gameOver) resetGame();
    };
};

new P5(sketch, 'Game');