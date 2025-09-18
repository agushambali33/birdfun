// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GameRewardDistributor is Ownable {
    IERC20 public rewardToken; // Token-mu
    uint256 public rewardRate; // Rate: 10 berarti 1 point = 0.1 token
    
    mapping(address => uint256) public playerPoints; // Points per player
    
    event PointsSubmitted(address indexed player, uint256 points);
    event RewardsRedeemed(address indexed player, uint256 points, uint256 amount);
    event RateUpdated(uint256 newRate);
    event TokensDeposited(uint256 amount);

    // Constructor: Pakai CA token-mu
    constructor() Ownable(msg.sender) {
        rewardToken = IERC20(0xBA756579e1B6C7E498915Ae82AdeacB04a2b2161);
        rewardRate = 10; // 1 point = 0.1 token
    }

    // Submit points dari game
    function submitPoints(uint256 _points) external {
        require(_points > 0, "Points must be greater than zero");
        playerPoints[msg.sender] += _points;
        emit PointsSubmitted(msg.sender, _points);
    }

    // Redeem points ke token
    function redeem() external {
        uint256 points = playerPoints[msg.sender];
        require(points > 0, "No points to redeem");
        uint256 amount = (points * (10 ** rewardToken.decimals())) / rewardRate; // Kalkulasi reward
        require(rewardToken.balanceOf(address(this)) >= amount, "Insufficient reward pool");
        
        playerPoints[msg.sender] = 0;
        rewardToken.transfer(msg.sender, amount);
        emit RewardsRedeemed(msg.sender, points, amount);
    }

    // Owner deposit token ke contract
    function depositTokens(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Amount must be greater than zero");
        rewardToken.transferFrom(msg.sender, address(this), _amount);
        emit TokensDeposited(_amount);
    }

    // Owner ubah rate
    function setRewardRate(uint256 _newRate) external onlyOwner {
        require(_newRate > 0, "Rate must be greater than zero");
        rewardRate = _newRate;
        emit RateUpdated(_newRate);
    }

    // View functions
    function getPlayerPoints(address _player) external view returns (uint256) {
        return playerPoints[_player];
    }

    function getPoolBalance() external view returns (uint256) {
        return rewardToken.balanceOf(address(this));
    }
}