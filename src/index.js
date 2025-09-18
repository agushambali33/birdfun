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

// === WALLET CONNECT ===
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

// === SUBMIT SCORE ===
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

// === REDEEM ===
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

// === UI TOGGLE ===
const toggleWeb3UI = () => {
    if (connectToggle) {
        if (isWalletConnected) {
            connectToggle.innerHTML = '✅ Connected';
            connectToggle.className = 'toggle connected style-text-outline';
        } else {
            connectToggle.innerHTML = '🔗 Connect';
            connectToggle.className = 'toggle style-text-outline';
        }
    }
    
    if (pointsBadge) {
        pointsBadge.innerHTML = playerPoints || 0;
        pointsBadge.className = playerPoints > 0 ? 'badge active style-text-outline' : 'badge style-text-outline';
    }
    
    if (rewardBadge) {
        const tokens = (rewardPreview / 1e18).toFixed(2);
        rewardBadge.innerHTML = `💎 ${tokens}`;
        rewardBadge.className = tokens > 0 ? 'badge reward active style-text-outline' : 'badge reward style-text-outline';
    }
    
    if (claimToggle) {
        const canClaim = playerPoints > 0;
        claimToggle.disabled = !canClaim;
        claimToggle.className = canClaim ? 'toggle claim active style-text-outline' : 'toggle claim disabled style-text-outline';
        claimToggle.innerHTML = canClaim ? '⚡ Claim' : '⚡ Locked';
    }
};

// === CREATE COMPACT UI ===
const createCompactUI = () => {
    console.log('🎨 Creating compact UI...');
    
    // CONNECT BUTTON (TOP-LEFT)
    connectToggle = document.createElement('button');
    connectToggle.className = 'toggle style-text-outline';
    connectToggle.innerHTML = '🔗 Connect';
    connectToggle.style.cssText = `
        position: fixed;
        top: 15px;
        left: 15px;
        width: 90px;
        height: 36px;
        border-radius: 18px;
        border: none;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        z-index: 1001;
        box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
        transition: all 0.3s ease;
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(10px);
    `;
    connectToggle.onclick = connectWallet;
    document.body.appendChild(connectToggle);
    
    // BADGES (TOP-RIGHT)
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
    
    // POINTS
    pointsBadge = document.createElement('div');
    pointsBadge.className = 'badge style-text-outline';
    pointsBadge.innerHTML = '0';
    pointsBadge.style.cssText = `
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: rgba(76, 175, 80, 0.2);
        border: 1px solid rgba(76, 175, 80, 0.4);
        color: #4CAF50;
        font-size: 14px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        backdrop-filter: blur(10px);
    `;
    badgeContainer.appendChild(pointsBadge);
    
    // REWARD
    rewardBadge = document.createElement('div');
    rewardBadge.className = 'badge reward style-text-outline';
    rewardBadge.innerHTML = '💎 0.00';
    rewardBadge.style.cssText = `
        width: 60px;
        height: 38px;
        border-radius: 18px;
        background: rgba(255, 215, 0, 0.15);
        border: 1px solid rgba(255, 215, 0, 0.3);
        color: #FFD700;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(10px);
    `;
    badgeContainer.appendChild(rewardBadge);
    
    // CLAIM BUTTON (BOTTOM-RIGHT)
    claimToggle = document.createElement('button');
    claimToggle.className = 'toggle claim disabled style-text-outline';
    claimToggle.innerHTML = '⚡ Locked';
    claimToggle.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 90px;
        height: 36px;
        border-radius: 18px;
        border: none;
        background: rgba(158, 158, 158, 0.3);
        color: #9E9E9E;
        font-size: 12px;
        font-weight: 700;
        cursor: not-allowed;
        z-index: 1000;
        backdrop-filter: blur(10px);
    `;
    claimToggle.onclick = redeemPoints;
    document.body.appendChild(claimToggle);
    
    // Add global styles
    addCompactStyles();
    toggleWeb3UI();
    console.log('✅ Compact UI ready');
};

// === STYLES ===
const addCompactStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
        .style-text-outline {
            -webkit-text-stroke: 1px black;
            -webkit-text-fill-color: currentcolor;
            text-shadow:
                1px 1px 0 #000,
               -1px 1px 0 #000,
                1px -1px 0 #000,
               -1px -1px 0 #000;
        }
    `;
    document.head.appendChild(style);
};

// === TOAST ===
const showToast = (message, type = 'info') => {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type} style-text-outline`;
    toast.innerHTML = `<span>${message}</span>`;
    
    Object.assign(toast.style, {
        position: 'fixed',
        top: '70px',
        right: '15px',
        padding: '10px 15px',
        background: 'rgba(0,0,0,0.85)',
        borderRadius: '12px',
        color: 'white',
        fontSize: '12px',
        fontWeight: '600',
        zIndex: 2000,
        backdropFilter: 'blur(8px)'
    });
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
};

// === ANIMATIONS ===
const animateConnectSuccess = () => {
    if (connectToggle) {
        connectToggle.style.transform = 'scale(1.1)';
        setTimeout(() => connectToggle.style.transform = 'scale(1)', 200);
    }
};
const animateScorePulse = (element) => {
    if (!element) return;
    element.style.transform = 'scale(1.2)';
    setTimeout(() => element.style.transform = 'scale(1)', 200);
};
const animateClaimSuccess = () => {
    if (pointsBadge) {
        pointsBadge.style.transform = 'scale(0.8)';
        setTimeout(() => pointsBadge.style.transform = 'scale(1)', 200);
    }
};

// === GAME LOOP ===
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

    p5.setup = () => {
        const canvas = p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        canvas.mousePressed(canvasClick);
        canvas.touchStarted(() => { if (!gameOver) bird?.jump(); if (!gameStart) gameStart = true; });
        
        createCompactUI();
        resetGame();
    };

    p5.draw = () => {
        p5.image(background, 0, 0);

        if (gameStart && !gameOver) {
            pipe.move(Math.floor(score / 10));
            pipe.draw();
            bird.update();
            bird.draw();
            floor.update();
            floor.draw();

            gameOver = pipe.checkCrash(bird) || bird.isDead();
            if (gameOver) {
                dieAudio.currentTime = 0; dieAudio.play();
                if (isWalletConnected && score > 0) {
                    setTimeout(() => submitScoreToBlockchain(score), 1000);
                }
            }

            if (pipe.getScore(bird)) {
                score++;
                pointAudio.currentTime = 0; pointAudio.play();
            }
        } else {
            pipe.draw(); bird.draw(); floor.draw();
            if (gameOver) bird.update(); else floor.update();
        }

        p5.textFont(birdyFont);
        p5.stroke(0);
        p5.strokeWeight(3);
        p5.fill(255);

        if (!gameStart) {
            p5.textAlign(p5.CENTER);
            p5.textSize(24);
            p5.text("Tap to Start", CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
        }

        if (gameOver) {
            p5.textAlign(p5.CENTER);
            p5.textSize(32);
            p5.text(`Game Over\nScore: ${score}\nBest: ${bestScore}`, CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
        } else {
            p5.textAlign(p5.CENTER);
            p5.textSize(28);
            p5.text(`${score}`, CANVAS_WIDTH/2, 80);
        }
    };
};

new P5(sketch, 'Game');