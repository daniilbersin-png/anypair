// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal stand-in for the PancakeSwap router used in tests.
///         Pulls the tokens it was approved for and keeps the BNB, mimicking a
///         liquidity deposit. Enough to exercise the launchpad's graduation path.
contract MockPancakeRouter {
    address public lastToken;
    uint256 public lastTokenAmount;
    uint256 public lastEthAmount;

    function factory() external view returns (address) {
        return address(this);
    }

    function WETH() external view returns (address) {
        return address(this);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address,
        uint256
    ) external payable returns (uint256, uint256, uint256) {
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        lastToken = token;
        lastTokenAmount = amountTokenDesired;
        lastEthAmount = msg.value;
        return (amountTokenDesired, msg.value, amountTokenDesired);
    }
}
