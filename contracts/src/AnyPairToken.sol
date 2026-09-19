// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AnyPairToken
/// @notice A standard fixed-supply ERC20 minted for each launched pair.
///         The entire supply is minted to the launchpad at creation; the launchpad
///         distributes it through the bonding curve and reserves a slice for DEX
///         liquidity at graduation. No mint/burn hooks, no owner, no hidden minting
///         => nothing rug-shaped lives in the token itself.
contract AnyPairToken is ERC20 {
    /// @notice The launchpad that owns the whole supply and runs the curve.
    address public immutable launchpad;

    /// @notice Human-readable asset this token is paired to (e.g. "CS2 | Dragon Lore").
    string public assetKey;

    /// @notice Oracle feed id for the paired asset (0x0 if none / pure meme).
    bytes32 public immutable feedId;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address launchpad_,
        string memory assetKey_,
        bytes32 feedId_
    ) ERC20(name_, symbol_) {
        require(launchpad_ != address(0), "AnyPairToken: zero launchpad");
        launchpad = launchpad_;
        assetKey = assetKey_;
        feedId = feedId_;
        _mint(launchpad_, totalSupply_);
    }
}
