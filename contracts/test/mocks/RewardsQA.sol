// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MockPancakeRouter} from "./MockPancakeRouter.sol";

/// @dev Only for local, disposable tests. Never deployed on a public chain.
contract RewardsQAUSD is ERC20 {
    constructor() ERC20("Local Test USDT", "USDT") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract RewardsQARouter is MockPancakeRouter {
    function getPair(address, address) external pure returns (address) {
        return address(0);
    }
}
