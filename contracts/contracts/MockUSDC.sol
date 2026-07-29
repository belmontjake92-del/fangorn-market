// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MockUSDC
/// @notice Minimal USDC-like ERC-20 with EIP-3009 `transferWithAuthorization`
///         (meta-transfer) for the Robinhood Chain paid-data flow, plus an open
///         `mint` for funding testnet buyers. Domain matches Circle's USDC
///         ("USD Coin" / version "2") so the same client signing works.
contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 private constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    bytes32 private immutable _DOMAIN_SEPARATOR;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error AuthExpired();
    error AuthNotYet();
    error AuthUsed();
    error BadSignature();

    constructor() {
        _DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("USD Coin")),
                keccak256(bytes("2")),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    /// @notice EIP-3009: execute a transfer authorized off-chain by `from`.
    ///         Anyone (e.g. a relayer) may submit it, so `from` needs no gas.
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
    ) external {
        if (block.timestamp <= validAfter) revert AuthNotYet();
        if (block.timestamp >= validBefore) revert AuthExpired();
        if (authorizationState[from][nonce]) revert AuthUsed();

        bytes32 structHash = keccak256(
            abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0) || signer != from) revert BadSignature();

        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _DOMAIN_SEPARATOR;
    }

    function _transfer(address from, address to, uint256 amount) private {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
