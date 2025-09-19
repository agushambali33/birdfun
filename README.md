# Flappy Bird: Hbird Rewards

A modern take on the classic Flappy Bird game, built with JavaScript, P5.js, and integrated with the Helios Testnet blockchain for earning Hbird tokens. Fly through pipes, earn points, and claim your rewards in a retro-styled, blockchain-powered gaming experience!

[Live Demo](https://birdfun.vercel.app/)

[Gameplay]
![flappyBird](./flappyBird.png)

## Features

- **Classic Flappy Bird Gameplay**: Navigate a bird through a series of pipes using simple tap or click controls, with a retro pixelated art style powered by P5.js.
- **Blockchain Integration**: Connect your MetaMask wallet to the Helios Testnet, submit your high scores, and claim Hbird token rewards.
- **Responsive UI**: 
  - **Connect Wallet**: Positioned on the top-left with a `🦊 Connect Wallet` button (shows shortened address when connected).
  - **Score/Hbird/Claim**: Vertically aligned on the top-right (`🏆 Score`, `💎 Hbird`, `⚡ Claim`), ensuring no interference with gameplay.
- **Reward System**: Earn points for each pipe passed, which can be submitted to a smart contract to earn Hbird tokens.
- **Retro Aesthetics**: Pixelated fonts, vibrant gradients (cyan for Connect, gold for Score, orange for Claim), and animations (shine for score updates, pulse for active Claim button).
- **Social Media & Swap**: Links to social media and a token swap feature for engaging with the Hbird ecosystem.

## Tech Stack

- **P5.js 1.4.2**: For game loop, rendering, and sprite animations.
- **Ethers.js 5.7.2**: For interacting with the Helios Testnet blockchain and smart contract.
- **Webpack 5**: For module bundling and optimized production builds.
- **SCSS**: For styling the UI with a retro, pixelated theme.
- **Vercel**: For hosting the live demo.

## Getting Started

### Prerequisites

- **Node.js**: Version 14 or higher.
- **MetaMask**: Installed in your browser for blockchain interactions.
- **Helios Testnet**: Add the Helios Testnet to MetaMask:
  - RPC: `https://testnet1.helioschainlabs.org`
  - Chain ID: `42000`
  - Symbol: `Hbird`
