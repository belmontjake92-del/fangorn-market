// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PriceOracle
/// @notice Minimal owner-pushable price feed for Fangorn Market's simulated-fill
///         settlement. The off-chain price service (holding the owner key) pushes
///         the latest price per market; the SettlementLedger reads it to mark fills
///         and positions to market.
/// @dev Prices are quote-per-base in USDC-style fixed point (`PRICE_SCALE` = 1e6),
///      i.e. a price of `100_000000` means 100.00 quote units per 1.0 base unit.
///      `updatedAt` lets consumers enforce a staleness bound.
contract PriceOracle is Ownable {
    uint256 public constant PRICE_SCALE = 1e6;

    struct Price {
        uint256 price; // quote per base, PRICE_SCALE fixed point
        uint64 updatedAt; // block timestamp of last update; 0 = never set
    }

    mapping(bytes32 marketId => Price) private _prices;

    event PriceUpdated(bytes32 indexed marketId, uint256 price, uint64 updatedAt);

    error ZeroPrice();
    error LengthMismatch();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Set the latest price for a single market.
    function setPrice(bytes32 marketId, uint256 price) external onlyOwner {
        _setPrice(marketId, price);
    }

    /// @notice Batch variant of {setPrice}.
    function setPrices(
        bytes32[] calldata marketIds,
        uint256[] calldata prices
    ) external onlyOwner {
        if (marketIds.length != prices.length) revert LengthMismatch();
        for (uint256 i = 0; i < marketIds.length; i++) {
            _setPrice(marketIds[i], prices[i]);
        }
    }

    /// @notice Latest price and its timestamp for `marketId`. `updatedAt == 0`
    ///         means no price has ever been set.
    function getPrice(bytes32 marketId) external view returns (uint256 price, uint64 updatedAt) {
        Price storage p = _prices[marketId];
        return (p.price, p.updatedAt);
    }

    /// @notice True if a price exists and is no older than `maxStaleness` seconds.
    function isFresh(bytes32 marketId, uint64 maxStaleness) external view returns (bool) {
        Price storage p = _prices[marketId];
        if (p.updatedAt == 0) return false;
        return block.timestamp - p.updatedAt <= maxStaleness;
    }

    function _setPrice(bytes32 marketId, uint256 price) private {
        if (price == 0) revert ZeroPrice();
        uint64 ts = uint64(block.timestamp);
        _prices[marketId] = Price({price: price, updatedAt: ts});
        emit PriceUpdated(marketId, price, ts);
    }
}
