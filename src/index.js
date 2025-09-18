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

// Contract config - V2 CONTRACT (VERIFIED!)
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

// DOM elements - INITIALIZE DULU DI SINI
let walletStatusEl = null;
let pointsDisplayEl = null;
let rewardPreviewEl = null;
let connectBtnEl = null;
let redeemBtnEl = null;

// Web3 functions
const connectWallet = async () => {
    console.log('🔄 Starting wallet connection...'); // DEBUG
    
    if (typeof window.ethereum !== 'undefined') {
        try {
            // Request account access
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            
            // Setup provider and signer
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            
            playerAddress = await signer.getAddress();
            isWalletConnected = true;
            
            console.log('✅ Wallet connected:', playerAddress);
            console.log('📊 DOM Elements ready:', {
                walletStatus: !!walletStatusEl,
                pointsDisplay: !!pointsDisplayEl,
                connectBtn: !!connectBtnEl,
                redeemBtn: !!redeemBtnEl
            });
            
            // Fetch current points
            try {
                playerPoints = await contract.playerPoints(playerAddress);
                rewardPreview = await contract.getRewardPreview(playerAddress);
                console.log('📊 Fetched points:', playerPoints.toString());
                console.log('💰 Fetched reward preview:', ethers.utils.formatUnits(rewardPreview, 18));
            } catch (fetchError) {
                console.error('⚠️ Fetch error:', fetchError);
                playerPoints = 0;
                rewardPreview = 0;
            }
            
            // CRITICAL: Update UI
            toggleWeb3UI();
            
            // Listen for changes
            if (window.ethereum) {
                window.ethereum.on('accountsChanged', () => {
                    console.log('👤 Account changed, reloading...');
                    window.location.reload();
                });
                window.ethereum.on('chainChanged', () => {
                    console.log('⛓️ Chain changed, reloading...');
                    window.location.reload();
                });
            }
            
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
        alert('Please connect wallet first!');
        return false;
    }
    
    try {
        console.log(`📤 Submitting score ${score}...`);
        
        const tx = await contract.submitPoints(score, {
            gasLimit: 300000
        });
        
        console.log('⏳ Tx sent, waiting confirmation...');
        const receipt = await tx.wait();
        
        console.log('✅ Submitted! TX:', receipt.transactionHash);
        alert(`Score ${score} submitted!\nTX: https://sepolia.etherscan.io/tx/${receipt.transactionHash}`);
        
        // Update points
        try {
            playerPoints = await contract.playerPoints(playerAddress);
            rewardPreview = await contract.getRewardPreview(playerAddress);
            console.log('📊 Updated points:', playerPoints.toString());
        } catch (error) {
            console.error('Update error:', error);
            playerPoints += score; // Fallback
        }
        
        toggleWeb3UI();
        return true;
        
    } catch (error) {
        console.error('❌ Submit error:', error);
        let msg = 'Submit failed: ';
        if (error.code === 4001) msg += 'User rejected';
        else if (error.message.includes('insufficient funds')) msg += 'Low ETH (get from faucet)';
        else msg += error.message;
        alert(msg);
        return false;
    }
};

const redeemPoints = async () => {
    console.log('💰 Starting redeem...');
    
    if (!isWalletConnected || !contract) {
        alert('Connect wallet first!');
        return;
    }
    
    if (playerPoints === 0) {
        alert('No points to redeem!');
        return;
    }
    
    try {
        const tx = await contract.redeem({ gasLimit: 300000 });
        console.log('⏳ Redeem tx sent...');
        
        const receipt = await tx.wait();
        console.log('✅ Redeemed! TX:', receipt.transactionHash);
        
        const tokens = (playerPoints / 10).toFixed(2);
        alert(`🎉 Redeemed ${playerPoints} points!\n💎 Got ${tokens} tokens\nTX: https://sepolia.etherscan.io/tx/${receipt.transactionHash}`);
        
        playerPoints = 0;
        rewardPreview = 0;
        toggleWeb3UI();
        
    } catch (error) {
        console.error('❌ Redeem error:', error);
        let msg = 'Redeem failed: ';
        if (error.message.includes('No points')) msg += 'No points available';
        else if (error.message.includes('Insufficient reward pool')) msg += 'Pool empty - contact admin';
        else if (error.code === 4001) msg += 'User rejected';
        else msg += error.message;
        alert(msg);
    }
};

// FIXED TOGGLE FUNCTION
const toggleWeb3UI = () => {
    console.log('🔄 Toggling UI - Connected:', isWalletConnected); // DEBUG
    
    // Wallet status
    if (walletStatusEl) {
        if (isWalletConnected && playerAddress) {
            walletStatusEl.innerHTML = `Connected: ${playerAddress.slice(0, 6)}...${playerAddress.slice(-4)}`;
            walletStatusEl.style.color = '#4CAF50';
            walletStatusEl.style.borderColor = '#4CAF50';
        } else {
            walletStatusEl.innerHTML = 'Not Connected';
            walletStatusEl.style.color = '#ff9800';
            walletStatusEl.style.borderColor = '#ff9800';
        }
    }
    
    // Points display
    if (pointsDisplayEl) {
        pointsDisplayEl.innerHTML = `Points: ${playerPoints || 0}`;
        pointsDisplayEl.style.color = playerPoints > 0 ? '#4CAF50' : '#ffffff';
        pointsDisplayEl.style.borderColor = playerPoints > 0 ? '#4CAF50' : '#4CAF50';
    }
    
    // Connect button - HIDE SETELAH CONNECT
    if (connectBtnEl) {
        connectBtnEl.style.display = isWalletConnected ? 'none' : 'block';
        console.log('Connect button display:', connectBtnEl.style.display); // DEBUG
    }
    
    // Redeem button - SHOW SETELAH CONNECT
    if (redeemBtnEl) {
        const shouldShow = isWalletConnected && playerPoints > 0;
        redeemBtnEl.style.display = shouldShow ? 'block' : 'none';
        console.log('Redeem button display:', redeemBtnEl.style.display, 'Points:', playerPoints); // DEBUG
    }
    
    // Reward preview - SHOW SETELAH CONNECT
    if (rewardPreviewEl) {
        const shouldShow = isWalletConnected;
        rewardPreviewEl.style.display = shouldShow ? 'block' : 'none';
        
        if (shouldShow && rewardPreview) {
            const tokens = (rewardPreview / 1e18).toFixed(2);
            rewardPreviewEl.innerHTML = `💎 ${tokens} tokens`;
            rewardPreviewEl.style.color = tokens > 0 ? '#FFD700' : '#888';
        } else {
            rewardPreviewEl.innerHTML = '💎 0.00 tokens';
            rewardPreviewEl.style.color = '#888';
        }
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
        
        // CRITICAL: Create UI BEFORE resetGame
        createWeb3UI();
        resetGame();
    };

    // FIXED UI CREATION - ASSIGN ELEMENTS PROPERLY
    const createWeb3UI = () => {
        console.log('🛠️ Creating Web3 UI...'); // DEBUG
        
        // Container untuk semua UI elements
        const uiContainer = document.createElement('div');
        uiContainer.id = 'web3-ui-container';
        uiContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 1001;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;
        document.body.appendChild(uiContainer);

        // 1. Wallet Status
        walletStatusEl = document.createElement('div');
        walletStatusEl.id = 'wallet-status';
        walletStatusEl.style.cssText = `
            color: #ff9800;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            background: rgba(0,0,0,0.9);
            padding: 8px 12px;
            border-radius: 6px;
            border: 2px solid #ff9800;
            min-width: 180px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(255,152,0,0.2);
        `;
        walletStatusEl.innerHTML = 'Not Connected';
        uiContainer.appendChild(walletStatusEl);

        // 2. Points Display
        pointsDisplayEl = document.createElement('div');
        pointsDisplayEl.id = 'points-display';
        pointsDisplayEl.style.cssText = `
            color: #4CAF50;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            font-weight: bold;
            background: rgba(0,0,0,0.9);
            padding: 8px 12px;
            border-radius: 6px;
            border: 2px solid #4CAF50;
            min-width: 180px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(76,175,80,0.2);
        `;
        pointsDisplayEl.innerHTML = 'Points: 0';
        uiContainer.appendChild(pointsDisplayEl);

        // 3. Reward Preview
        rewardPreviewEl = document.createElement('div');
        rewardPreviewEl.id = 'reward-preview';
        rewardPreviewEl.style.cssText = `
            color: #888;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            background: rgba(0,0,0,0.9);
            padding: 6px 10px;
            border-radius: 6px;
            border: 2px solid #888;
            min-width: 180px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            display: none;
        `;
        rewardPreviewEl.innerHTML = '💎 0.00 tokens';
        uiContainer.appendChild(rewardPreviewEl);

        // 4. Connect Button
        connectBtnEl = document.createElement('button');
        connectBtnEl.id = 'connect-wallet';
        connectBtnEl.innerHTML = '🔗 Connect Wallet';
        connectBtnEl.style.cssText = `
            padding: 10px 20px;
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            min-width: 180px;
            box-shadow: 0 4px 12px rgba(76,175,80,0.3);
            transition: all 0.3s ease;
        `;
        connectBtnEl.onmouseover = () => {
            connectBtnEl.style.transform = 'translateY(-2px)';
            connectBtnEl.style.boxShadow = '0 6px 16px rgba(76,175,80,0.4)';
        };
        connectBtnEl.onmouseout = () => {
            connectBtnEl.style.transform = 'translateY(0)';
            connectBtnEl.style.boxShadow = '0 4px 12px rgba(76,175,80,0.3)';
        };
        connectBtnEl.onclick = connectWallet;
        uiContainer.appendChild(connectBtnEl);

        // 5. Redeem Button
        redeemBtnEl = document.createElement('button');
        redeemBtnEl.id = 'redeem-btn';
        redeemBtnEl.innerHTML = '💎 Claim Tokens';
        redeemBtnEl.style.cssText = `
            padding: 10px 20px;
            background: linear-gradient(45deg, #2196F3, #1976D2);
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            min-width: 180px;
            box-shadow: 0 4px 12px rgba(33,150,243,0.3);
            transition: all 0.3s ease;
            display: none;
        `;
        redeemBtnEl.onmouseover = () => {
            redeemBtnEl.style.transform = 'translateY(-2px)';
            redeemBtnEl.style.boxShadow = '0 6px 16px rgba(33,150,243,0.4)';
        };
        redeemBtnEl.onmouseout = () => {
            redeemBtnEl.style.transform = 'translateY(0)';
            redeemBtnEl.style.boxShadow = '0 4px 12px rgba(33,150,243,0.3)';
        };
        redeemBtnEl.onclick = redeemPoints;
        uiContainer.appendChild(redeemBtnEl);

        console.log('✅ UI created, elements assigned:', {
            walletStatus: !!walletStatusEl,
            points: !!pointsDisplayEl,
            connect: !!connectBtnEl,
            redeem: !!redeemBtnEl
        });

        // Initial toggle
        toggleWeb3UI();
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