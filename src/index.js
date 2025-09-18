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

// DOM elements - DUAL LAYOUT
let connectButton, rewardPanel, pointsEl, rewardEl, claimButton, panelToggle, notificationEl;

// Notification system
let currentNotification = null;

// Web3 functions
const connectWallet = async () => {
    console.log('🔄 Connecting...');
    
    if (typeof window.ethereum === 'undefined') {
        showNotification('Install MetaMask!', 'error');
        return;
    }
    
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
        } catch (e) {
            playerPoints = 0;
            rewardPreview = 0;
        }
        
        updateUI();
        updateConnectButton();
        showNotification('Wallet connected!', 'success');
        
        window.ethereum.on('accountsChanged', () => window.location.reload());
        window.ethereum.on('chainChanged', () => window.location.reload());
        
    } catch (error) {
        console.error('Connection failed:', error);
        showNotification('Connection failed', 'error');
    }
};

const submitScoreToBlockchain = async (score) => {
    if (!isWalletConnected || !contract) {
        showNotification('Connect wallet first!', 'warning');
        return false;
    }
    
    try {
        const tx = await contract.submitPoints(score, { gasLimit: 300000 });
        showNotification('Submitting...', 'loading');
        
        const receipt = await tx.wait();
        playerPoints = await contract.playerPoints(playerAddress);
        rewardPreview = await contract.getRewardPreview(playerAddress);
        
        updateUI();
        showNotification(`+${score} points!`, 'success');
        animateScoreGain(pointsEl, score);
        
        return true;
    } catch (error) {
        console.error('Submit failed:', error);
        let msg = error.code === 4001 ? 'Cancelled' : 'Submit failed';
        showNotification(msg, 'error');
        return false;
    }
};

const redeemPoints = async () => {
    if (!isWalletConnected || !contract || playerPoints === 0) {
        showNotification('No points to claim!', 'warning');
        return;
    }
    
    try {
        const tx = await contract.redeem({ gasLimit: 300000 });
        showNotification('Claiming tokens...', 'loading');
        
        const receipt = await tx.wait();
        const tokens = (playerPoints / 10).toFixed(2);
        
        playerPoints = 0;
        rewardPreview = 0;
        updateUI();
        
        showNotification(`Claimed ${tokens} tokens!`, 'success');
        animateClaimSuccess();
        
    } catch (error) {
        console.error('Redeem failed:', error);
        let msg = 'Claim failed';
        if (error.message.includes('No points')) msg = 'No points';
        else if (error.code === 4001) msg = 'Cancelled';
        showNotification(msg, 'error');
    }
};

// UI Functions
const updateUI = () => {
    if (pointsEl) pointsEl.textContent = playerPoints;
    if (rewardEl) {
        const tokens = (rewardPreview / 1e18).toFixed(2);
        rewardEl.innerHTML = `💎 ${tokens}`;
        rewardEl.className = tokens > 0 ? 'reward active' : 'reward';
    }
    
    if (claimButton) {
        const canClaim = playerPoints > 0;
        claimButton.disabled = !canClaim;
        claimButton.className = canClaim ? 'claim-btn active' : 'claim-btn';
    }
};

const updateConnectButton = () => {
    if (connectButton) {
        if (isWalletConnected) {
            connectButton.innerHTML = `🔗 ${playerAddress.slice(-4)}`;
            connectButton.className = 'connect-btn connected';
        } else {
            connectButton.innerHTML = '🔗 Connect';
            connectButton.className = 'connect-btn';
        }
    }
};

const toggleRewardPanel = () => {
    if (rewardPanel) {
        const isOpen = rewardPanel.classList.contains('open');
        rewardPanel.classList.toggle('open');
        panelToggle.innerHTML = isOpen ? '▼' : '▲';
    }
};

const animateScoreGain = (element, score) => {
    if (!element) return;
    element.style.transform = 'scale(1.1)';
    element.style.color = '#FFD700';
    setTimeout(() => {
        element.style.transform = 'scale(1)';
        element.style.color = '#4CAF50';
    }, 200);
};

const animateClaimSuccess = () => {
    if (pointsEl) {
        pointsEl.style.transform = 'scale(0.95)';
        pointsEl.style.color = '#FFD700';
        setTimeout(() => {
            pointsEl.style.transform = 'scale(1)';
            pointsEl.style.color = '#4CAF50';
        }, 150);
    }
};

// Notification System - Compact Toasts
const showNotification = (message, type = 'info') => {
    if (currentNotification) currentNotification.remove();
    
    const notification = document.createElement('div');
    notification.className = `toast ${type}`;
    notification.innerHTML = `
        <span class="icon">${getIcon(type)}</span>
        <span>${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${getToastColor(type)};
        color: white;
        padding: 10px 16px;
        border-radius: 8px;
        font-family: 'Courier New', monospace;
        font-size: 12px;
        font-weight: 500;
        z-index: 1002;
        min-width: 200px;
        max-width: 280px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        border-left: 3px solid ${getBorderColor(type)};
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    });
    
    currentNotification = notification;
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
};

const getIcon = (type) => {
    const icons = { success: '✅', error: '❌', warning: '⚠️', loading: '⏳', info: 'ℹ️' };
    return icons[type] || icons.info;
};

const getToastColor = (type) => {
    const colors = {
        success: 'linear-gradient(135deg, #4CAF50, #45a049)',
        error: 'linear-gradient(135deg, #f44336, #d32f2f)',
        warning: 'linear-gradient(135deg, #ff9800, #f57c00)',
        loading: 'linear-gradient(135deg, #9E9E9E, #757575)',
        info: 'linear-gradient(135deg, #2196F3, #1976D2)'
    };
    return colors[type] || colors.info;
};

const getBorderColor = (type) => {
    const colors = { success: '#4CAF50', error: '#f44336', warning: '#ff9800', loading: '#9E9E9E', info: '#2196F3' };
    return colors[type] || colors.info;
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
        const data = storage.getStorageData();
        bestScore = data?.bestScore || 0;
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
        
        createDualUI();
        resetGame();
    };

    // DUAL UI SYSTEM - MINI CONNECT + COLLAPSIBLE PANEL
    const createDualUI = () => {
        console.log('🎨 Creating dual UI...');
        
        // 1. MINI CONNECT BUTTON - KIRI ATAS (SEMPRE VISIBLE)
        connectButton = document.createElement('button');
        connectButton.className = 'connect-btn';
        connectButton.innerHTML = '🔗';
        connectButton.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: none;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            z-index: 1001;
            box-shadow: 0 4px 16px rgba(76,175,80,0.3);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        connectButton.onmouseover = () => {
            if (!isWalletConnected) {
                connectButton.style.transform = 'scale(1.05)';
                connectButton.style.boxShadow = '0 6px 20px rgba(76,175,80,0.4)';
            }
        };
        
        connectButton.onmouseout = () => {
            connectButton.style.transform = 'scale(1)';
            connectButton.style.boxShadow = '0 4px 16px rgba(76,175,80,0.3)';
        };
        
        connectButton.onclick = connectWallet;
        document.body.appendChild(connectButton);
        
        // 2. COLLAPSIBLE REWARD PANEL - KANAN BAWAH
        rewardPanel = document.createElement('div');
        rewardPanel.id = 'reward-panel';
        rewardPanel.className = 'closed';
        rewardPanel.innerHTML = `
            <div class="panel-header">
                <span class="panel-icon">💎</span>
                <span class="panel-title">REWARDS</span>
                <button class="panel-toggle" id="panel-toggle">▼</button>
            </div>
            <div class="panel-content">
                <div class="stat-line">
                    <span class="stat-label">Points</span>
                    <span class="stat-value" id="points-value">0</span>
                </div>
                <div class="stat-line">
                    <span class="stat-label">Tokens</span>
                    <span class="stat-value reward-value" id="reward-value">0.00</span>
                </div>
                <button class="claim-btn" id="claim-btn" disabled>
                    <span class="claim-icon">⚡</span>
                    <span class="claim-text">Claim</span>
                </button>
            </div>
        `;
        
        rewardPanel.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            width: 260px;
            background: linear-gradient(145deg, rgba(15,15,15,0.95), rgba(25,25,25,0.95));
            backdrop-filter: blur(15px);
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 
                0 16px 40px rgba(0,0,0,0.4),
                inset 0 1px 0 rgba(255,255,255,0.02);
            z-index: 1000;
            opacity: 0;
            transform: translateY(100px) scale(0.9);
            transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            font-family: 'Courier New', monospace;
        `;
        
        document.body.appendChild(rewardPanel);
        
        // Assign elements
        pointsEl = document.getElementById('points-value');
        rewardEl = document.getElementById('reward-value');
        claimButton = document.getElementById('claim-btn');
        panelToggle = document.getElementById('panel-toggle');
        
        // Event listeners
        if (panelToggle) panelToggle.onclick = toggleRewardPanel;
        if (claimButton) claimButton.onclick = redeemPoints;
        
        // Initial state
        updateConnectButton();
        updateUI();
        
        // Auto-show panel on first connect
        setTimeout(() => {
            if (isWalletConnected) {
                rewardPanel.style.opacity = '1';
                rewardPanel.style.transform = 'translateY(0) scale(1)';
            }
        }, 500);
        
        // Add CSS animations
        addDualUIStyles();
    };

    const addDualUIStyles = () => {
        const style = document.createElement('style');
        style.textContent = `
            /* Panel Open Animation */
            #reward-panel.open {
                opacity: 1 !important;
                transform: translateY(0) scale(1) !important;
            }
            
            #reward-panel.closed {
                opacity: 0.8;
                transform: translateY(20px) scale(0.95);
            }
            
            /* Panel Header */
            .panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px 12px;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            
            .panel-icon {
                font-size: 20px;
                margin-right: 8px;
            }
            
            .panel-title {
                color: #FFD700;
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.5px;
            }
            
            .panel-toggle {
                background: none;
                border: none;
                color: rgba(255,255,255,0.6);
                font-size: 16px;
                cursor: pointer;
                padding: 4px;
                border-radius: 50%;
                transition: all 0.2s ease;
            }
            
            .panel-toggle:hover {
                color: #FFD700;
                background: rgba(255,215,0,0.1);
                transform: scale(1.1);
            }
            
            /* Panel Content */
            .panel-content {
                padding: 0 20px 20px;
            }
            
            .stat-line {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                margin-bottom: 8px;
            }
            
            .stat-line:last-child {
                border-bottom: none;
                margin-bottom: 16px;
            }
            
            .stat-label {
                color: rgba(255,255,255,0.7);
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .stat-value {
                color: #4CAF50;
                font-size: 16px;
                font-weight: 600;
            }
            
            .reward-value {
                color: #FFD700 !important;
                text-shadow: 0 0 4px rgba(255,215,0,0.3);
            }
            
            /* Claim Button */
            .claim-btn {
                width: 100%;
                padding: 12px;
                border-radius: 12px;
                border: none;
                font-family: inherit;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.3s ease;
                margin-top: 4px;
            }
            
            .claim-btn {
                background: linear-gradient(135deg, rgba(33,150,243,0.2), rgba(33,150,243,0.1));
                color: #2196F3;
                border: 1px solid rgba(33,150,243,0.3);
            }
            
            .claim-btn.active {
                background: linear-gradient(135deg, #2196F3, #1976D2);
                color: white;
                border-color: #2196F3;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(33,150,243,0.3);
            }
            
            .claim-btn.active:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(33,150,243,0.4);
            }
            
            .claim-btn.disabled:hover {
                cursor: not-allowed;
                opacity: 0.6;
            }
            
            .claim-icon {
                font-size: 14px;
            }
            
            /* Connect Button States */
            .connect-btn {
                transition: all 0.3s ease !important;
            }
            
            .connect-btn.connected {
                background: linear-gradient(135deg, #4CAF50, #45a049) !important;
                box-shadow: 0 4px 16px rgba(76,175,80,0.4) !important;
            }
            
            .connect-btn.connected:hover {
                transform: scale(1.05) !important;
                box-shadow: 0 6px 20px rgba(76,175,80,0.5) !important;
            }
            
            /* Toast Notifications */
            .toast {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                border-left: 3px solid;
                min-width: 180px;
                max-width: 260px;
            }
            
            .toast.success { background: rgba(76,175,80,0.95); border-left-color: #4CAF50; }
            .toast.error { background: rgba(244,67,54,0.95); border-left-color: #f44336; }
            .toast.warning { background: rgba(255,152,0,0.95); border-left-color: #ff9800; }
            .toast.loading { background: rgba(158,158,158,0.95); border-left-color: #9E9E9E; }
            
            .toast .icon { font-size: 14px; min-width: 16px; }
        `;
        document.head.appendChild(style);
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
    };

    p5.keyPressed = (e) => {
        if (e.key === ' ') {
            if (!gameOver) bird?.jump();
            if (!gameStart) gameStart = true;
        }
        if (e.key === 'r' && gameOver) resetGame();
    };
}

new P5(sketch, 'Game');