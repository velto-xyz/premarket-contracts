// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MockUSDC
 * @notice Mock USDC token for local testing
 * @dev Implements standard ERC20 with 6 decimals and EIP-2612 permit (matching real USDC)
 */
contract MockUSDC is ERC20, ERC20Permit {
    constructor() ERC20("Mock USDC", "USDC") ERC20Permit("Mock USDC") {
        // Mint 1 million USDC to deployer for testing
        _mint(msg.sender, 1_000_000 * 10**6);
    }

    /**
     * @notice USDC has 6 decimals
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mint tokens (for testing only)
     * @param to Address to mint to
     * @param amount Amount to mint (6 decimals)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Faucet function - anyone can get 10,000 USDC for testing
     */
    function faucet() external {
        _mint(msg.sender, 10_000 * 10**6); // 10,000 USDC
    }
}
