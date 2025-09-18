// index.js (FULL merged version)
// Keep all original asset imports / paths the same as your project
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

// Helios testnet config (readonly RPC + chain metadata)
const HELIOS_RPC = 'https://testnet1.helioschainlabs.org';
const HELIOS_CHAIN_ID = 42000;
const HELIOS_CHAIN_ID_HEX = ethers.utils.hexValue(HELIOS_CHAIN_ID);

// Contract config (user-specified)
const CONTRACT_ADDRESS = '0x8bc2324615139B31b9E1861CD31C475980b4dA9e';
const CONTRACT_ABI = [
    "function submitPoints(uint256 _points) external",
    "function redeem() external",
    "function playerPoints(address) external view returns (uint256)",
    "function getRewardPreview(address) external view returns (uint256)",
    "function getPoolBalance() external view returns (uint256)"
];

// Providers / contract
const providerReadonly = new ethers.providers.JsonRpcProvider(HELIOS_RPC);
let provider, signer, contract;
let contractReadOnly = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, providerReadonly);

// State
let isWalletConnected = false;
let playerPoints = 0; // keep simple number for compat with UI logic
let playerAddress = null;
let rewardPreview = ethers.BigNumber.from(0);

// DOM elements - Compact UI
let connectToggle, pointsBadge, rewardBadge, claimToggle;

// UTIL helpers
const bnToNumberSafe = (bn) => {
    try {
        if (!bn) return 0;
        if (typeof bn.toNumber === 'function') return bn.toNumber();
        return Number(bn) || 0;
    } catch {
        try { return Number(bn.toString()); } catch { return 0; }
    }
};
const formatReward = (bn) => {
    try {
        if (!bn) return '0.00';
        return Number(ethers.utils.formatEther(bn)).toFixed(2);
    } catch {
        try { return (Number(bn) / 1e18).toFixed(2); } catch { return '0.00'; }
    }
};

// Toast (compact)
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
    const icons = { success: '✅', error: '❌', warning: '⚠️', loading: '⏳' };
    return icons[type] || 'ℹ️';
};

// Animations (kept from your nice script)
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

// ===== WEB3 FUNCTIONS (with Helios chain switch attempt) =====
const connectWallet = async () => {
    console.log('🔄 Starting wallet connection...');
    if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask!');
        return;
    }
    try {
        // try switch chain to Helios first (if available)
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: HELIOS_CHAIN_ID_HEX }]
            });
        } catch (switchErr) {
            if (switchErr && switchErr.code === 4902) {
                // add chain if not present
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: HELIOS_CHAIN_ID_HEX,
                            chainName: 'Helios Testnet',
                            nativeCurrency: { name: 'Helios', symbol: 'HLS', decimals: 18 },
                            rpcUrls: [HELIOS_RPC],
                            blockExplorerUrls: ['https://explorer.helioschainlabs.org']
                        }]
                    });
                } catch (addErr) {
                    console.warn('Failed to add Helios network', addErr);
                }
            } else {
                // ignore other switch errors
            }
        }

        // request accounts
        await window.ethereum.request({ method: 'eth_requestAccounts' });

        provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
        signer = provider.getSigner();
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        playerAddress = await signer.getAddress();
        isWalletConnected = !!playerAddress;

        try {
            const pts = await contract.playerPoints(playerAddress).catch(()=>ethers.BigNumber.from(0));
            playerPoints = bnToNumberSafe(pts);
        } catch (e) {
            playerPoints = 0;
        }
        try {
            rewardPreview = await contract.getRewardPreview(playerAddress).catch(()=>ethers.BigNumber.from(0));
        } catch (e) {
            rewardPreview = ethers.BigNumber.from(0);
        }

        toggleWeb3UI();
        animateConnectSuccess();
        showToast('Wallet connected', 'success');

        window.ethereum.on('accountsChanged', () => window.location.reload());
        window.ethereum.on('chainChanged', () => window.location.reload());

    } catch (error) {
        console.error('❌ Connection error:', error);
        alert('Failed to connect wallet: ' + (error?.message || error));
    }
};

// Submit score - non-blocking (background wait)
const submitScoreToBlockchain = async (score) => {
    if (!isWalletConnected || !contract) {
        showToast('Connect wallet first!', 'warning');
        return false;
    }

    try {
        console.log(`📤 Submitting score ${score}...`);
        showToast('Submitting score...', 'loading');

        const tx = await contract.submitPoints(score, { gasLimit: 300000 });
        // Wait in background to keep UI responsive
        tx.wait().then(async () => {
            try {
                const pts = await contract.playerPoints(playerAddress).catch(()=>ethers.BigNumber.from(0));
                playerPoints = bnToNumberSafe(pts);
            } catch {}
            try {
                rewardPreview = await contract.getRewardPreview(playerAddress).catch(()=>ethers.BigNumber.from(0));
            } catch {}
            toggleWeb3UI();
            showToast(`+${score} points!`, 'success');
            animateScorePulse(pointsBadge, score);
        }).catch((e) => {
            console.warn('Submit wait failed', e);
            showToast('Submit transaction failed', 'error');
        });

        return true;
    } catch (error) {
        console.error('❌ Submit error:', error);
        let msg = 'Submit failed: ';
        if (error.code === 4001) msg += 'Cancelled';
        else if (error.message && error.message.includes('insufficient funds')) msg += 'Low ETH';
        else msg += (error.message || error);
        showToast(msg, 'error');
        return false;
    }
};

// Redeem/claim - non-blocking
const redeemPoints = async () => {
    if (!isWalletConnected || !contract || playerPoints === 0) {
        showToast('No points to claim!', 'warning');
        return;
    }

    try {
        showToast('Claiming tokens...', 'loading');
        const tx = await contract.redeem({ gasLimit: 300000 });
        tx.wait().then(async () => {
            // After success, refresh on-chain values (best-effort)
            try {
                const pts = await contract.playerPoints(playerAddress).catch(()=>ethers.BigNumber.from(0));
                playerPoints = bnToNumberSafe(pts);
            } catch { playerPoints = 0; }
            try {
                rewardPreview = await contract.getRewardPreview(playerAddress).catch(()=>ethers.BigNumber.from(0));
            } catch { rewardPreview = ethers.BigNumber.from(0); }

            toggleWeb3UI();
            const tokens = (playerPoints / 10).toFixed(2);
            playerPoints = 0;
            rewardPreview = ethers.BigNumber.from(0);
            toggleWeb3UI();
            showToast(`Claimed ${tokens} tokens! 🎉`, 'success');
            animateClaimSuccess();
        }).catch((e) => {
            console.warn('Claim wait failed', e);
            showToast('Claim transaction failed', 'error');
        });
    } catch (error) {
        console.error('❌ Redeem error:', error);
        let msg = 'Claim failed: ';
        if (error.message && error.message.includes('No points')) msg += 'No points';
        else if (error.code === 4001) msg += 'Cancelled';
        else msg += (error.message || error);
        showToast(msg, 'error');
    }
};

// toggle UI - keep style from your compact script
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
        const tokens = formatReward(rewardPreview);
        rewardBadge.innerHTML = `💎 ${tokens}`;
        rewardBadge.className = Number(tokens) > 0 ? 'badge reward active' : 'badge reward';
    }

    // Claim toggle
    if (claimToggle) {
        const canClaim = playerPoints > 0;
        claimToggle.disabled = !canClaim;
        claimToggle.className = canClaim ? 'toggle claim active' : 'toggle claim disabled';
        claimToggle.innerHTML = canClaim ? '⚡ Claim' : '⚡ Locked';
    }
};

// ===== Compact UI Creation (kept aesthetics) =====
const createCompactUI = () => {
    // 1. CONNECT button (top-left)
    connectToggle = document.createElement('button');
    connectToggle.className = 'toggle';
    connectToggle.innerHTML = '🔗 Connect';
    connectToggle.style.cssText = `
        position: fixed;
        top: 15px;
        left: 15px;
        width: 84px;
        height: 34px;
        border-radius: 16px;
        border: none;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        z-index: 1001;
        box-shadow: 0 2px 12px rgba(102, 126, 234, 0.3);
        display:flex; align-items:center; justify-content:center;
    `;
    connectToggle.onclick = connectWallet;
    document.body.appendChild(connectToggle);

    // badge container (top-right)
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

    // points badge
    pointsBadge = document.createElement('div');
    pointsBadge.className = 'badge';
    pointsBadge.innerHTML = '0';
    pointsBadge.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(76, 175, 80, 0.12);
        border: 1px solid rgba(76, 175, 80, 0.28);
        color: #4CAF50;
        font-size: 12px;
        font-weight: 700;
        display:flex; align-items:center; justify-content:center;
        box-shadow: 0 2px 8px rgba(76, 175, 80, 0.12);
    `;
    badgeContainer.appendChild(pointsBadge);

    // reward badge
    rewardBadge = document.createElement('div');
    rewardBadge.className = 'badge reward';
    rewardBadge.innerHTML = '💎 0.00';
    rewardBadge.style.cssText = `
        width: 62px;
        height: 36px;
        border-radius: 18px;
        background: rgba(255, 215, 0, 0.12);
        border: 1px solid rgba(255, 215, 0, 0.22);
        color: #FFD700;
        font-size: 11px;
        font-weight: 700;
        display:flex; align-items:center; justify-content:center;
        box-shadow: 0 2px 8px rgba(255, 215, 0, 0.12);
    `;
    badgeContainer.appendChild(rewardBadge);

    // claim toggle (bottom-right)
    claimToggle = document.createElement('button');
    claimToggle.className = 'toggle claim disabled';
    claimToggle.innerHTML = '⚡ Locked';
    claimToggle.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 84px;
        height: 36px;
        border-radius: 16px;
        border: none;
        background: rgba(158, 158, 158, 0.28);
        color: #9E9E9E;
        font-size: 12px;
        font-weight: 700;
        cursor: not-allowed;
        z-index: 1000;
        box-shadow: 0 2px 12px rgba(158, 158, 158, 0.2);
        display:flex; align-items:center; justify-content:center;
        opacity: 0; transform: translateY(8px);
    `;
    claimToggle.onclick = redeemPoints;
    document.body.appendChild(claimToggle);

    addCompactStyles();
    toggleWeb3UI();
    console.log('✅ Compact UI ready');
};

const addCompactStyles = () => {
    const style = document.createElement('style');
    style.textContent = `
        .toggle { transition: all 0.25s cubic-bezier(0.4,0,0.2,1); border: none; }
        .toggle.connected { background: linear-gradient(135deg,#4CAF50,#45a049) !important; box-shadow: 0 3px 12px rgba(76,175,80,0.3) !important; transform: scale(1.02); }
        .toggle.claim.active { background: linear-gradient(135deg,#2196F3,#1976D2) !important; color: white !important; cursor: pointer !important; opacity: 1 !important; transform: translateY(0) scale(1); }
        .toggle.claim.disabled { background: rgba(158,158,158,0.18) !important; color: #9E9E9E !important; cursor: not-allowed !important; opacity: 0.95; transform: translateY(8px); }
        .badge { transition: all 0.25s ease; border-radius: 8px; padding: 2px 6px; }
        .badge.active { transform: scale(1.06); box-shadow: 0 3px 12px rgba(76,175,80,0.15); }
        .badge.reward.active { animation: rewardGlow 1.5s ease-in-out infinite alternate; }
        @keyframes rewardGlow { 0% { box-shadow: 0 0 8px rgba(255,215,0,0.12);} 100% { box-shadow: 0 0 18px rgba(255,215,0,0.22);} }

        /* toast */
        .toast {
            position: fixed;
            top: 80px;
            right: 15px;
            background: rgba(0,0,0,0.92);
            backdrop-filter: blur(8px);
            border-radius: 12px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 600;
            z-index: 1002;
            min-width: 160px;
            color: #fff;
            display:flex; gap:8px; align-items:center;
            transform: translateX(100%); opacity: 0;
            transition: all 0.28s ease;
        }
        .toast.show { transform: translateX(0); opacity: 1; }
        .toast.success { border-left: 4px solid #4CAF50; }
        .toast.error { border-left: 4px solid #f44336; }
        .toast.warning { border-left: 4px solid #ff9800; }
        .toast.loading { border-left: 4px solid #9E9E9E; }

        .icon { min-width: 18px; display:inline-block; text-align:center; }
    `;
    document.head.appendChild(style);
};

// ===== P5 Game (use original reset logic + event handling integrated) =====
const sketch = p5 => {
    // robust load like original (but simplified)
    let backgroundImg, spriteImage, birdyFont;
    let gameStart, gameOver, bird, pipe, floor, gameButton, gameText, score, storage, bestScore;

    const safeLoadImg = (src, onSuccess, onError) => {
        try { return p5.loadImage(src, onSuccess, onError); } catch (e) { return p5.createImage(1,1); }
    };

    p5.preload = () => {
        try { spriteImage = safeLoadImg(Images); } catch { spriteImage = p5.createImage(1,1); }
        try { backgroundImg = safeLoadImg(BackgroundImage); } catch { backgroundImg = p5.createImage(1,1); }
        try { birdyFont = p5.loadFont(font); } catch { birdyFont = null; }
    };

    // resetGame (mirror old logic exactly)
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
        // keep UI reachable after reset
        toggleWeb3UI();
    };

    const canvasClick = () => {
        // In both states, allow jumping; when gameOver allow reset via click on the reset button area
        if (p5.mouseButton === 'left') {
            if (!gameOver) bird?.jump();
            if (!gameStart) gameStart = true;

            if (gameOver &&
                p5.mouseX > CANVAS_WIDTH / 2 - 85 &&
                p5.mouseX < CANVAS_WIDTH / 2 + 75 &&
                p5.mouseY > CANVAS_HEIGHT / 2 + 100 &&
                p5.mouseY < CANVAS_HEIGHT / 2 + 160
            ) {
                resetGame();
            }
        }
    };

    const canvasTouch = () => {
        if (!gameOver) bird?.jump();
        if (!gameStart) gameStart = true;
        // on touch, if gameOver - allow reset by touch area too
        if (gameOver &&
            p5.touches && p5.touches.length
        ) {
            const t = p5.touches[0];
            if (t.x > CANVAS_WIDTH / 2 - 85 && t.x < CANVAS_WIDTH / 2 + 75 && t.y > CANVAS_HEIGHT / 2 + 100 && t.y < CANVAS_HEIGHT / 2 + 160) {
                resetGame();
            }
        }
    };

    p5.setup = () => {
        const canvas = p5.createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        p5.frameRate(60);

        // bind both p5 canvas handlers and DOM fallback for robust behavior
        try {
            canvas.mousePressed(canvasClick);
            canvas.touchStarted(canvasTouch);
            // also attach native listeners for extra reliability
            if (p5.canvas) {
                p5.canvas.addEventListener('mousedown', canvasClick);
                p5.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); canvasTouch(); }, { passive: false });
            }
        } catch (e) { /* ignore */ }

        // create UI compact (your nice UI)
        createCompactUI();

        // reset game state
        resetGame();
    };

    p5.draw = () => {
        try {
            // draw background (use image or fallback)
            if (backgroundImg && backgroundImg.width > 1) p5.image(backgroundImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            else p5.background(135, 206, 235);

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

                    // submit points (non-blocking) - slight delay so player sees gameOver
                    if (isWalletConnected && score > 0) {
                        setTimeout(() => submitScoreToBlockchain(score), 700);
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
                gameButton.resetButton(); // keep reset button visible/clickable
            } else {
                gameText.scoreText(score, level);
            }

            // periodic UI refresh (every 60 frames ~ 1s)
            if (p5.frameCount % 60 === 0) {
                (async () => {
                    try {
                        if (isWalletConnected && contract && playerAddress) {
                            const pts = await contract.playerPoints(playerAddress).catch(()=>ethers.BigNumber.from(0));
                            playerPoints = bnToNumberSafe(pts);
                            const rp = await contract.getRewardPreview(playerAddress).catch(()=>ethers.BigNumber.from(0));
                            rewardPreview = rp || ethers.BigNumber.from(0);
                        } else {
                            // best-effort readonly refresh (if playerAddress is known)
                            if (playerAddress) {
                                const ptsRO = await contractReadOnly.playerPoints?.(playerAddress).catch(()=>ethers.BigNumber.from(0));
                                if (ptsRO) playerPoints = bnToNumberSafe(ptsRO);
                                const rpRO = await contractReadOnly.getRewardPreview?.(playerAddress).catch(()=>ethers.BigNumber.from(0));
                                if (rpRO) rewardPreview = rpRO;
                            }
                        }
                    } catch (e) { /* ignore */ }
                    toggleWeb3UI();
                })();
            }
        } catch (drawErr) {
            console.error('Draw error', drawErr);
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

// Expose for debugging if needed
window.submitScoreToBlockchain = submitScoreToBlockchain;
window.redeemPoints = redeemPoints;
window.connectWallet = connectWallet;