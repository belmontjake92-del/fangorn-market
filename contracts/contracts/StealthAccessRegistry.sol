// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

interface IEip3009Stealth {
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

/// @title StealthAccessRegistry
/// @notice Stealth mode for paid, encrypted data on Robinhood Chain. Each resource
///         owns a Semaphore group. Paying for a resource adds the buyer's Semaphore
///         identity commitment to that group. Access is then granted to anyone who
///         can produce a zero-knowledge proof of membership, so the access worker
///         never learns which paying member is decrypting.
/// @dev Joining a group (the payment) is public. Using access is anonymous within
///      the group. This mirrors x402f's Semaphore model on Arbitrum.
contract StealthAccessRegistry {
    IEip3009Stealth public immutable usdc;
    ISemaphore public immutable semaphore;

    struct Resource {
        address owner;
        uint256 price; // USDC base units
        uint256 groupId; // Semaphore group of paying members
        string uri;
        bool exists;
    }

    mapping(bytes32 => Resource) private _resources;
    mapping(bytes32 => mapping(uint256 => bool)) public isMember;

    event ResourceCreated(bytes32 indexed resourceId, address indexed owner, uint256 price, uint256 groupId, string uri);
    event AccessPurchased(bytes32 indexed resourceId, uint256 identityCommitment, uint256 amount);

    error ResourceExists();
    error UnknownResource();
    error Underpaid();

    constructor(address usdc_, address semaphore_) {
        usdc = IEip3009Stealth(usdc_);
        semaphore = ISemaphore(semaphore_);
    }

    function createResource(bytes32 resourceId, uint256 price, string calldata uri) external {
        if (_resources[resourceId].exists) revert ResourceExists();
        // This contract becomes the group admin, so only paying buyers can join.
        uint256 groupId = semaphore.createGroup();
        _resources[resourceId] = Resource({ owner: msg.sender, price: price, groupId: groupId, uri: uri, exists: true });
        emit ResourceCreated(resourceId, msg.sender, price, groupId, uri);
    }

    /// @notice Relay a buyer's EIP-3009 authorization (buyer pays no gas), pay the
    ///         owner, and add the buyer's identity commitment to the resource group.
    function pay(
        bytes32 resourceId,
        uint256 identityCommitment,
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

        usdc.transferWithAuthorization(from, res.owner, amount, validAfter, validBefore, nonce, v, r, s);

        if (!isMember[resourceId][identityCommitment]) {
            isMember[resourceId][identityCommitment] = true;
            semaphore.addMember(res.groupId, identityCommitment);
        }
        emit AccessPurchased(resourceId, identityCommitment, amount);
    }

    /// @notice True if `proof` shows membership in the resource's paid group and is
    ///         scoped to this resource. Read-only: the worker calls it before
    ///         releasing a decryption key, and never learns which member it was.
    function verifyAccess(bytes32 resourceId, ISemaphore.SemaphoreProof calldata proof) external view returns (bool) {
        Resource storage res = _resources[resourceId];
        if (!res.exists) return false;
        if (proof.scope != uint256(resourceId)) return false;
        return semaphore.verifyProof(res.groupId, proof);
    }

    function getResource(bytes32 resourceId)
        external
        view
        returns (address owner, uint256 price, uint256 groupId, string memory uri)
    {
        Resource storage res = _resources[resourceId];
        return (res.owner, res.price, res.groupId, res.uri);
    }

    function getPrice(bytes32 resourceId) external view returns (uint256) {
        return _resources[resourceId].price;
    }
}
