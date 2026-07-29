// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title DataRegistry
/// @notice An EVM (Solidity) reimplementation of Fangorn's DataRegistry — The
///         Grove's on-chain anchor. It matches the Fangorn SDK ABI exactly, so
///         the SDK can run against it unchanged. This lets The Grove operate on
///         Robinhood Chain (EVM) without the Stylus/Rust toolchain.
///
/// @dev The registry stores exactly one 32-byte state root per publisher and
///      fast-forwards it on each commit; the actual graph data lives on IPFS,
///      addressed by that root. The SDK only round-trips the bytes32, so a
///      Solidity implementation is behaviorally identical to the Stylus one.
contract DataRegistry {
    enum Status {
        Unregistered, // 0
        Active, // 1
        Suspended // 2
    }

    address public admin;
    uint256 public registrationFee;
    uint64 public publisherCount;

    mapping(address => Status) private _status;
    mapping(address => bytes32) private _head;

    error AlreadyRegistered();
    error NotRegistered();
    error PublisherSuspendedErr();
    error RegistrationFeeRequired();
    error StaleStateRoot();
    error Unauthorized();

    event PublisherRegistered(address indexed publisher, bytes32 initial_root);
    event PublisherReactivated(address indexed publisher, bytes32 current_root);
    event PublisherSuspended(address indexed publisher);
    event RegistrationFeeChanged(uint256 fee);
    event StateCommitted(address indexed publisher, bytes32 indexed old_root, bytes32 indexed new_root);

    constructor() {
        admin = msg.sender;
    }

    /// @notice Register the caller as a publisher (idempotency handled by the SDK
    ///         checking isRegistered first). Reactivates a suspended publisher.
    function register() external payable {
        Status s = _status[msg.sender];
        if (s == Status.Active) revert AlreadyRegistered();
        if (msg.value < registrationFee) revert RegistrationFeeRequired();
        if (s == Status.Suspended) {
            _status[msg.sender] = Status.Active;
            emit PublisherReactivated(msg.sender, _head[msg.sender]);
            return;
        }
        _status[msg.sender] = Status.Active;
        _head[msg.sender] = bytes32(0);
        publisherCount += 1;
        emit PublisherRegistered(msg.sender, bytes32(0));
    }

    /// @notice Fast-forward the caller's state root from `old_root` to `new_root`.
    function commitStateRoot(bytes32 old_root, bytes32 new_root) external {
        Status s = _status[msg.sender];
        if (s == Status.Unregistered) revert NotRegistered();
        if (s == Status.Suspended) revert PublisherSuspendedErr();
        if (_head[msg.sender] != old_root) revert StaleStateRoot();
        _head[msg.sender] = new_root;
        emit StateCommitted(msg.sender, old_root, new_root);
    }

    function getNamespaceHead(address publisher) external view returns (bytes32) {
        return _head[publisher];
    }

    function getPublisherStatus(address publisher) external view returns (uint8) {
        return uint8(_status[publisher]);
    }

    function isRegistered(address publisher) external view returns (bool) {
        return _status[publisher] == Status.Active;
    }

    function setRegistrationFee(uint256 fee) external {
        if (msg.sender != admin) revert Unauthorized();
        registrationFee = fee;
        emit RegistrationFeeChanged(fee);
    }

    function suspendPublisher(address publisher) external {
        if (msg.sender != admin) revert Unauthorized();
        _status[publisher] = Status.Suspended;
        emit PublisherSuspended(publisher);
    }
}
