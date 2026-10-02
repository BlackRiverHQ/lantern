// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Hashing
/// @notice Domain-separated digests. Two objects of different kinds can never collide by shape.
library Hashing {
    bytes32 internal constant DOMAIN_PAYLOAD = keccak256("lantern.payload.v1");
    bytes32 internal constant DOMAIN_ROUND = keccak256("lantern.round.v1");
    bytes32 internal constant DOMAIN_LIQUIDATION = keccak256("lantern.liquidation.v1");
    bytes32 internal constant DOMAIN_CHALLENGE = keccak256("lantern.challenge.v1");
    bytes32 internal constant DOMAIN_VERDICT = keccak256("lantern.verdict.v1");

    function payload(bytes32 feedId, uint256 value, uint64 round, uint64 timestamp, address signer)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(DOMAIN_PAYLOAD, feedId, value, round, timestamp, signer));
    }

    function slot(bytes32 feedId, uint64 round) internal pure returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_ROUND, feedId, round));
    }

    function liquidation(uint256 liquidationId, bytes32 feedId, uint256 bonus)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(DOMAIN_LIQUIDATION, liquidationId, feedId, bonus));
    }

    function challenge(uint256 liquidationId, address prover, uint8 rule, bytes32 evidenceHash)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(DOMAIN_CHALLENGE, liquidationId, prover, rule, evidenceHash));
    }

    function verdict(uint256 liquidationId, uint8 rule, uint256 observed, uint256 bound)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(DOMAIN_VERDICT, liquidationId, rule, observed, bound));
    }
}
