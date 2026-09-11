// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPriceOracle {
    function getPrice(bytes32 marketId) external view returns (uint256 price, uint64 updatedAt);
}

/// @title SettlementLedger
/// @notice Onchain bookkeeping for Fangorn Market deployments running under the
///         "simulated fills, onchain settlement" model. An agent decides to buy or
///         sell; the fill is accepted at the current {PriceOracle} price and the
///         resulting position, entry, realized/unrealized PnL and cash are recorded
///         onchain and read back by the app. No ERC-20 moves - balances are notional
///         USDC-6 integers. Real token settlement can layer on in a later phase.
///
/// @dev Fixed point:
///      - price: USDC-6 quote per base (from the oracle, `PRICE_SCALE` = 1e6)
///      - size:  base units, 1e6 fixed point, signed (long > 0, short < 0)
///      - cash / PnL / notional: USDC-6, signed where applicable
///      notional = |size| * price / 1e6 ; pnl = size * (price - entry) / 1e6
///      A limit of 0 means "unlimited" (disabled) for both risk caps.
contract SettlementLedger is Ownable {
    uint256 public constant PRICE_SCALE = 1e6;
    uint256 public constant SIZE_SCALE = 1e6;
    uint64 public constant DAY = 1 days;

    struct RiskLimits {
        uint256 maxPositionNotional; // USDC-6; 0 = unlimited
        uint256 dailyLossLimit; // USDC-6 magnitude; 0 = unlimited
    }

    struct Account {
        address owner;
        address operator; // key allowed to submit fills (the agent runtime)
        bool exists;
        bool paused;
        int256 cash; // USDC-6
        RiskLimits limits;
        uint64 dayBucket; // block.timestamp / DAY of the current loss window
        int256 dayRealizedPnl; // realized PnL accumulated in the current day
    }

    struct Position {
        int256 size; // base units, signed, SIZE_SCALE fixed point
        uint256 entryPrice; // volume-weighted average entry, PRICE_SCALE
    }

    IPriceOracle public oracle;
    uint64 public maxStaleness; // seconds a price may age before fills are blocked
    bool public emergencyStopped; // blocks all fills across every deployment

    mapping(bytes32 deploymentId => Account) private _accounts;
    mapping(bytes32 deploymentId => mapping(bytes32 marketId => Position)) private _positions;
    mapping(bytes32 deploymentId => mapping(bytes32 marketId => bool)) public marketAllowed;

    event OracleUpdated(address indexed oracle);
    event MaxStalenessUpdated(uint64 maxStaleness);
    event EmergencyStop(bool stopped);
    event DeploymentOpened(bytes32 indexed id, address indexed owner, address indexed operator, uint256 openingCash);
    event MarketAllowedSet(bytes32 indexed id, bytes32 indexed marketId, bool allowed);
    event OperatorUpdated(bytes32 indexed id, address indexed operator);
    event LimitsUpdated(bytes32 indexed id, uint256 maxPositionNotional, uint256 dailyLossLimit);
    event PausedSet(bytes32 indexed id, bool paused);
    event FillSettled(
        bytes32 indexed id,
        bytes32 indexed marketId,
        int256 sizeDelta,
        uint256 price,
        int256 newSize,
        uint256 newEntryPrice,
        int256 realizedPnl,
        int256 cashAfter
    );

    error NotOperator();
    error NotAuthorized();
    error Stopped();
    error DeploymentPaused();
    error UnknownDeployment();
    error DeploymentExists();
    error MarketNotAllowed();
    error NoPrice();
    error StalePrice();
    error PositionLimitExceeded();
    error DailyLossLimitExceeded();
    error ZeroSizeDelta();

    constructor(address initialOwner, address oracle_, uint64 maxStaleness_) Ownable(initialOwner) {
        oracle = IPriceOracle(oracle_);
        maxStaleness = maxStaleness_;
    }

    // ─────────────────────────────── admin ───────────────────────────────

    function setOracle(address oracle_) external onlyOwner {
        oracle = IPriceOracle(oracle_);
        emit OracleUpdated(oracle_);
    }

    function setMaxStaleness(uint64 maxStaleness_) external onlyOwner {
        maxStaleness = maxStaleness_;
        emit MaxStalenessUpdated(maxStaleness_);
    }

    function setEmergencyStop(bool stopped) external onlyOwner {
        emergencyStopped = stopped;
        emit EmergencyStop(stopped);
    }

    /// @notice Open a deployment account with opening capital, risk limits and an
    ///         allowlist of tradable markets. Platform-operated (onlyOwner).
    function openDeployment(
        bytes32 id,
        address owner_,
        address operator,
        uint256 openingCash,
        RiskLimits calldata limits,
        bytes32[] calldata markets
    ) external onlyOwner {
        if (_accounts[id].exists) revert DeploymentExists();
        Account storage a = _accounts[id];
        a.owner = owner_;
        a.operator = operator;
        a.exists = true;
        a.cash = int256(openingCash);
        a.limits = limits;
        a.dayBucket = uint64(block.timestamp) / DAY;
        for (uint256 i = 0; i < markets.length; i++) {
            marketAllowed[id][markets[i]] = true;
            emit MarketAllowedSet(id, markets[i], true);
        }
        emit DeploymentOpened(id, owner_, operator, openingCash);
    }

    function setMarketAllowed(bytes32 id, bytes32 marketId, bool allowed) external {
        _requireOwnerOrDeploymentOwner(id);
        marketAllowed[id][marketId] = allowed;
        emit MarketAllowedSet(id, marketId, allowed);
    }

    function setOperator(bytes32 id, address operator) external {
        _requireOwnerOrDeploymentOwner(id);
        _accounts[id].operator = operator;
        emit OperatorUpdated(id, operator);
    }

    function setLimits(bytes32 id, RiskLimits calldata limits) external {
        _requireOwnerOrDeploymentOwner(id);
        _accounts[id].limits = limits;
        emit LimitsUpdated(id, limits.maxPositionNotional, limits.dailyLossLimit);
    }

    /// @notice Pause/unpause a single deployment. Owner (platform) or the
    ///         deployment's owner may call - this is the per-agent emergency stop.
    function setPaused(bytes32 id, bool paused) external {
        _requireOwnerOrDeploymentOwner(id);
        _accounts[id].paused = paused;
        emit PausedSet(id, paused);
    }

    // ─────────────────────────────── fills ───────────────────────────────

    /// @notice Submit a simulated fill: change the position by `sizeDelta` (signed,
    ///         SIZE_SCALE) at the current oracle price. Enforces every risk gate,
    ///         realizes PnL on reductions/flips, and updates the weighted-average
    ///         entry and cash. Callable only by the deployment's operator.
    function submitFill(bytes32 id, bytes32 marketId, int256 sizeDelta) external {
        Account storage a = _accounts[id];
        if (!a.exists) revert UnknownDeployment();
        if (msg.sender != a.operator) revert NotOperator();
        if (emergencyStopped) revert Stopped();
        if (a.paused) revert DeploymentPaused();
        if (sizeDelta == 0) revert ZeroSizeDelta();
        if (!marketAllowed[id][marketId]) revert MarketNotAllowed();

        (uint256 price, uint64 updatedAt) = oracle.getPrice(marketId);
        if (updatedAt == 0) revert NoPrice();
        if (block.timestamp - updatedAt > maxStaleness) revert StalePrice();

        Position storage pos = _positions[id][marketId];
        (int256 newSize, uint256 newEntry, int256 realized) =
            _applyFill(pos.size, pos.entryPrice, sizeDelta, price);

        // Position-notional cap on the resulting exposure.
        uint256 maxNotional = a.limits.maxPositionNotional;
        if (maxNotional != 0) {
            uint256 notional = _notional(newSize, price);
            if (notional > maxNotional) revert PositionLimitExceeded();
        }

        // Daily realized-loss cap, on a rolling UTC-day window.
        uint64 today = uint64(block.timestamp) / DAY;
        if (a.dayBucket != today) {
            a.dayBucket = today;
            a.dayRealizedPnl = 0;
        }
        a.dayRealizedPnl += realized;
        uint256 dailyLimit = a.limits.dailyLossLimit;
        if (dailyLimit != 0 && a.dayRealizedPnl < -int256(dailyLimit)) {
            revert DailyLossLimitExceeded();
        }

        a.cash += realized;
        pos.size = newSize;
        pos.entryPrice = newEntry;

        emit FillSettled(id, marketId, sizeDelta, price, newSize, newEntry, realized, a.cash);
    }

    /// @dev Pure position math. Returns the new size, new weighted-average entry,
    ///      and realized PnL (USDC-6) produced by applying `sizeDelta` at `price`.
    function _applyFill(
        int256 size,
        uint256 entry,
        int256 sizeDelta,
        uint256 price
    ) internal pure returns (int256 newSize, uint256 newEntry, int256 realized) {
        newSize = size + sizeDelta;

        bool sameOrOpening = size == 0 || (size > 0) == (sizeDelta > 0);
        if (sameOrOpening) {
            // Increasing (or opening) exposure in one direction: no PnL realized,
            // blend the entry price by absolute size.
            uint256 absOld = _abs(size);
            uint256 absAdd = _abs(sizeDelta);
            newEntry = (absOld * entry + absAdd * price) / (absOld + absAdd);
            return (newSize, newEntry, 0);
        }

        // Reducing, closing, or flipping: realize PnL on the closed quantity.
        uint256 absSize = _abs(size);
        uint256 absDelta = _abs(sizeDelta);
        uint256 closedQty = absDelta < absSize ? absDelta : absSize;

        int256 dir = size > 0 ? int256(1) : int256(-1);
        // realized = dir * closedQty * (price - entry) / PRICE_SCALE
        realized = (dir * int256(closedQty) * (int256(price) - int256(entry))) / int256(PRICE_SCALE);

        if (newSize == 0) {
            newEntry = 0;
        } else if (_sign(newSize) == _sign(size)) {
            // Partial close: entry unchanged.
            newEntry = entry;
        } else {
            // Flip: remaining opens a fresh position at the fill price.
            newEntry = price;
        }
    }

    // ─────────────────────────────── views ───────────────────────────────

    function getAccount(bytes32 id)
        external
        view
        returns (
            address owner_,
            address operator,
            bool exists,
            bool paused,
            int256 cash,
            RiskLimits memory limits,
            uint64 dayBucket,
            int256 dayRealizedPnl
        )
    {
        Account storage a = _accounts[id];
        return (a.owner, a.operator, a.exists, a.paused, a.cash, a.limits, a.dayBucket, a.dayRealizedPnl);
    }

    function getPosition(bytes32 id, bytes32 marketId)
        external
        view
        returns (int256 size, uint256 entryPrice)
    {
        Position storage p = _positions[id][marketId];
        return (p.size, p.entryPrice);
    }

    /// @notice Mark-to-market unrealized PnL (USDC-6) for a position at the current
    ///         oracle price. Reverts if no price is set.
    function unrealizedPnl(bytes32 id, bytes32 marketId) public view returns (int256) {
        Position storage p = _positions[id][marketId];
        if (p.size == 0) return 0;
        (uint256 price, uint64 updatedAt) = oracle.getPrice(marketId);
        if (updatedAt == 0) revert NoPrice();
        return (p.size * (int256(price) - int256(p.entryPrice))) / int256(PRICE_SCALE);
    }

    /// @notice Current absolute notional (USDC-6) of a position at the oracle price.
    function positionNotional(bytes32 id, bytes32 marketId) external view returns (uint256) {
        Position storage p = _positions[id][marketId];
        if (p.size == 0) return 0;
        (uint256 price,) = oracle.getPrice(marketId);
        return _notional(p.size, price);
    }

    /// @notice Account equity for a single market: cash + unrealized PnL.
    function equity(bytes32 id, bytes32 marketId) external view returns (int256) {
        return _accounts[id].cash + unrealizedPnl(id, marketId);
    }

    // ────────────────────────────── internal ─────────────────────────────

    function _notional(int256 size, uint256 price) internal pure returns (uint256) {
        return (_abs(size) * price) / PRICE_SCALE;
    }

    function _requireOwnerOrDeploymentOwner(bytes32 id) internal view {
        Account storage a = _accounts[id];
        if (!a.exists) revert UnknownDeployment();
        if (msg.sender != owner() && msg.sender != a.owner) revert NotAuthorized();
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return x >= 0 ? uint256(x) : uint256(-x);
    }

    function _sign(int256 x) internal pure returns (int256) {
        return x > 0 ? int256(1) : (x < 0 ? int256(-1) : int256(0));
    }
}
