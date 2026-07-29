// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IEip3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @title PaidAccessRegistry
/// @notice The Robinhood-Chain-native settlement rail for paid, encrypted data —
///         a pragmatic stand-in for x402f's Stylus SettlementRegistry. A seller
///         registers a priced resource; a buyer's EIP-3009 USDC authorization is
///         relayed through `pay`, which pays the owner directly and records the
///         settlement. An access worker gates decryption on `isSettled`.
///
/// @dev Simplification vs x402f: no Semaphore ZK layer, so the buyer's address
///      (not an unlinkable stealth address) is what settlement is keyed on. The
///      paid-decrypt behavior is identical; the privacy guarantee is not.
contract PaidAccessRegistry {
    IEip3009 public immutable usdc;

    struct Resource {
        address owner;
        uint256 price; // USDC base units
        string uri;
        bool exists;
    }

    mapping(bytes32 => Resource) private _resources;
    mapping(bytes32 => mapping(address => bool)) public settled;

    event ResourceCreated(bytes32 indexed resourceId, address indexed owner, uint256 price, string uri);
    event AccessSettled(bytes32 indexed resourceId, address indexed buyer, uint256 amount);

    error ResourceExists();
    error UnknownResource();
    error Underpaid();

    constructor(address usdc_) {
        usdc = IEip3009(usdc_);
    }

    function createResource(bytes32 resourceId, uint256 price, string calldata uri) external {
        if (_resources[resourceId].exists) revert ResourceExists();
        _resources[resourceId] = Resource({ owner: msg.sender, price: price, uri: uri, exists: true });
        emit ResourceCreated(resourceId, msg.sender, price, uri);
    }

    /// @notice Relay a buyer's EIP-3009 authorization: pay the owner and record
    ///         the settlement. Callable by anyone (a relayer), so the buyer needs
    ///         no gas. The authorization must pay the resource owner.
    function pay(
        bytes32 resourceId,
        address from,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        Resource storage res = _resources[resourceId];
        if (!res.exists) revert UnknownResource();
        if (amount < res.price) revert Underpaid();

        // Pays the owner directly; reverts if the signature/nonce is invalid.
        usdc.transferWithAuthorization(from, res.owner, amount, validAfter, validBefore, nonce, v, r, s);

        settled[resourceId][from] = true;
        emit AccessSettled(resourceId, from, amount);
    }

    function isSettled(bytes32 resourceId, address buyer) external view returns (bool) {
        return settled[resourceId][buyer];
    }

    function getPrice(bytes32 resourceId) external view returns (uint256) {
        return _resources[resourceId].price;
    }

    function getResource(bytes32 resourceId) external view returns (address owner, uint256 price, string memory uri) {
        Resource storage res = _resources[resourceId];
        return (res.owner, res.price, res.uri);
    }
}
