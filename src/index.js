import './main.scss';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './game/constants';
import Pipe from './game/pipe';
import Bird from './game/bird';
import Floor from './game/floor';
import Text from './game/gameText';
import Button from './game/gameButton';

// ===============================
// Compact UI Web3 Integration
// ===============================
function createCompactUI() {
  const wrapper = document.createElement("div");
  wrapper.className = "compact-ui";

  wrapper.innerHTML = `
    <div class="compact-top-left">
      <div id="walletAddressBadge">🔌 Connect Wallet</div>
      <div id="pointBadge">⭐ Point: 0</div>
      <div id="rewardBadge">🎁 Reward: 0</div>
      <button id="claimButton">Claim</button>
    </div>
    <div class="compact-top-right">
      <button id="connectButton">🔗 Connect</button>
    </div>
  `;

  document.body.appendChild(wrapper);
  addCompactStyles();
}

function addCompactStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .compact-ui {
      font-family: 'FlappyBirdy', Arial, sans-serif;
      font-size: 14px;
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      display: flex;
      justify-content: space-between;
      z-index: 1000;
    }
    .compact-top-left {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 200px;
    }
    .compact-top-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #walletAddressBadge, #pointBadge, #rewardBadge {
      background: rgba(0,0,0,0.6);
      color: white;
      padding: 4px 8px;
      border-radius: 8px;
      font-size: 13px;
      white-space: nowrap;
    }
    #claimButton, #connectButton {
      font-family: 'FlappyBirdy', Arial, sans-serif;
      font-size: 13px;
      padding: 6px 10px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    #claimButton {
      background: #FFD700;
      color: black;
    }
    #claimButton:hover {
      background: #e6c200;
    }
    #connectButton {
      background: #28a745;
      color: white;
    }
    #connectButton:hover {
      background: #218838;
    }
    #toast {
      font-family: 'FlappyBirdy', Arial, sans-serif;
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      display: none;
      z-index: 2000;
    }
  `;
  document.head.appendChild(style);
}

// ===============================
// Web3 Logic
// ===============================
let walletAddress = null;
let point = 0;
let reward = 0;

async function connectWallet() {
  if (!window.ethereum) {
    showToast("Metamask not installed!");
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    walletAddress = accounts[0];
    updateWalletUI();
    showToast("Wallet connected!");
  } catch (err) {
    console.error(err);
    showToast("Connection failed!");
  }
}

function updateWalletUI() {
  const badge = document.getElementById("walletAddressBadge");
  if (walletAddress) {
    badge.textContent = "🔌 " + walletAddress.slice(0, 6) + "..." + walletAddress.slice(-4);
  } else {
    badge.textContent = "🔌 Connect Wallet";
  }
}

function updatePointRewardUI() {
  document.getElementById("pointBadge").textContent = "⭐ Point: " + point;
  document.getElementById("rewardBadge").textContent = "🎁 Reward: " + reward;
}

function showToast(msg) {
  const toast = document.getElementById("toast") || (() => {
    const el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
    return el;
  })();

  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => toast.style.display = "none", 2500);
}

async function claimPoints() {
  if (!walletAddress) {
    showToast("Please connect wallet first!");
    return;
  }
  if (point <= 0) {
    showToast("No points to claim!");
    return;
  }
  reward += point;
  point = 0;
  updatePointRewardUI();
  showToast("Points claimed!");
}

async function submitPointsToSmartContract() {
  if (!walletAddress) {
    showToast("Please connect wallet first!");
    return;
  }
  if (reward <= 0) {
    showToast("No rewards to submit!");
    return;
  }
  // Simulasi submit ke smart contract
  showToast("Submitting reward to smart contract...");
  console.log("Reward submitted:", reward);
  reward = 0;
  updatePointRewardUI();
}

// ===============================
// Game Setup
// ===============================
function setupGameUI() {
  createCompactUI();

  document.getElementById("connectButton").addEventListener("click", connectWallet);
  document.getElementById("claimButton").addEventListener("click", claimPoints);

  updateWalletUI();
  updatePointRewardUI();
}

setupGameUI();

// ===============================
// Game Text with Stroke
// ===============================
export class GameText {
  constructor(p5, msg, x, y, size = 32) {
    this.p5 = p5;
    this.msg = msg;
    this.x = x;
    this.y = y;
    this.size = size;
  }

  draw() {
    const p5 = this.p5;
    p5.textAlign(p5.CENTER, p5.CENTER);
    p5.textSize(this.size);
    p5.fill(255);
    p5.stroke(0);
    p5.strokeWeight(1.5); // outline tipis
    p5.text(this.msg, this.x, this.y);
  }
}