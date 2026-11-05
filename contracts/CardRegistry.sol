// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title CardRegistry
 * @notice Authoritative registry for PaidX NFC card authenticators linked to user Smart Accounts.
 * Raw NFC UIDs are never stored on-chain; all references use keccak256(rawUid + salt).
 */
contract CardRegistry is Ownable2Step {
    enum CardStatus {
        Pending,
        Active,
        Frozen,
        Revoked
    }

    struct CardRecord {
        address owner;
        CardStatus status;
        uint64 registeredAt;
        uint64 statusUpdatedAt;
    }

    mapping(bytes32 => CardRecord) public cards;
    mapping(address => bytes32[]) private _ownerCards;

    event CardRegistered(bytes32 indexed cardHash, address indexed owner, uint64 timestamp);
    event CardStatusUpdated(
        bytes32 indexed cardHash,
        CardStatus indexed previousStatus,
        CardStatus indexed newStatus,
        uint64 timestamp
    );

    error CardAlreadyRegistered(bytes32 cardHash);
    error CardNotFound(bytes32 cardHash);
    error UnauthorizedCaller();
    error InvalidStatusTransition();
    error ZeroAddress();
    error ZeroHash();

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    /**
     * @notice Registers a new NFC card hash and associates it with the user's Smart Account.
     * @param cardHash The salted keccak256 hash of the physical NFC UID.
     * @param owner The user's MetaMask Smart Account address.
     */
    function registerCard(bytes32 cardHash, address owner) external {
        if (cardHash == bytes32(0)) revert ZeroHash();
        if (owner == address(0)) revert ZeroAddress();
        if (cards[cardHash].owner != address(0)) revert CardAlreadyRegistered(cardHash);

        uint64 nowTs = uint64(block.timestamp);
        cards[cardHash] = CardRecord({
            owner: owner,
            status: CardStatus.Active,
            registeredAt: nowTs,
            statusUpdatedAt: nowTs
        });

        _ownerCards[owner].push(cardHash);

        emit CardRegistered(cardHash, owner, nowTs);
    }

    /**
     * @notice Allows a card owner to update the status (e.g. freeze or revoke) their own card.
     * @param cardHash The salted keccak256 hash of the physical NFC UID.
     * @param newStatus The desired new lifecycle status.
     */
    function setCardStatus(bytes32 cardHash, CardStatus newStatus) external {
        CardRecord storage record = cards[cardHash];
        if (record.owner == address(0)) revert CardNotFound(cardHash);
        if (msg.sender != record.owner && msg.sender != owner()) revert UnauthorizedCaller();
        if (record.status == CardStatus.Revoked) revert InvalidStatusTransition();

        CardStatus prev = record.status;
        record.status = newStatus;
        record.statusUpdatedAt = uint64(block.timestamp);

        emit CardStatusUpdated(cardHash, prev, newStatus, uint64(block.timestamp));
    }

    /**
     * @notice Verifies if a given card is currently active and returns the owner.
     * @param cardHash The salted keccak256 hash of the physical NFC UID.
     * @return isActive True if the card status is Active.
     * @return owner The address of the card owner.
     */
    function verifyCardActive(bytes32 cardHash) external view returns (bool isActive, address owner) {
        CardRecord storage record = cards[cardHash];
        return (record.status == CardStatus.Active, record.owner);
    }

    /**
     * @notice Returns all card hashes owned by a specific address.
     */
    function getOwnerCards(address owner) external view returns (bytes32[] memory) {
        return _ownerCards[owner];
    }
}

