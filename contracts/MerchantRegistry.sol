// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MerchantRegistry
 * @notice Authoritative registry of approved retail merchants and their settlement payout addresses on Sepolia.
 */
contract MerchantRegistry is Ownable2Step, Pausable {
    struct MerchantRecord {
        address payoutAddress;
        bool isActive;
        uint64 registeredAt;
    }

    mapping(bytes32 => MerchantRecord) public merchants;

    event MerchantRegistered(bytes32 indexed merchantId, address indexed payoutAddress);
    event MerchantPayoutAddressUpdated(
        bytes32 indexed merchantId,
        address indexed oldAddress,
        address indexed newAddress
    );
    event MerchantStatusToggled(bytes32 indexed merchantId, bool indexed isActive);

    error MerchantAlreadyExists(bytes32 merchantId);
    error MerchantNotFound(bytes32 merchantId);
    error MerchantInactive(bytes32 merchantId);
    error ZeroAddress();
    error ZeroId();
    error UnauthorizedCaller();

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    /**
     * @notice Registers an approved retail merchant.
     * @param merchantId Unique identifier for the store (keccak256 hash or UUID).
     * @param payoutAddress The Base/Sepolia receiving address where settlements are directed.
     */
    function registerMerchant(bytes32 merchantId, address payoutAddress) external onlyOwner whenNotPaused {
        if (merchantId == bytes32(0)) revert ZeroId();
        if (payoutAddress == address(0)) revert ZeroAddress();
        if (merchants[merchantId].payoutAddress != address(0)) revert MerchantAlreadyExists(merchantId);

        merchants[merchantId] = MerchantRecord({
            payoutAddress: payoutAddress,
            isActive: true,
            registeredAt: uint64(block.timestamp)
        });

        emit MerchantRegistered(merchantId, payoutAddress);
    }

    /**
     * @notice Updates the payout address for an existing merchant.
     */
    function updatePayoutAddress(bytes32 merchantId, address newPayoutAddress) external whenNotPaused {
        if (newPayoutAddress == address(0)) revert ZeroAddress();
        MerchantRecord storage record = merchants[merchantId];
        if (record.payoutAddress == address(0)) revert MerchantNotFound(merchantId);
        if (msg.sender != record.payoutAddress && msg.sender != owner()) revert UnauthorizedCaller();

        address oldAddress = record.payoutAddress;
        record.payoutAddress = newPayoutAddress;

        emit MerchantPayoutAddressUpdated(merchantId, oldAddress, newPayoutAddress);
    }

    /**
     * @notice Allows protocol admin to freeze/unfreeze a merchant account.
     */
    function setMerchantActive(bytes32 merchantId, bool active) external onlyOwner {
        MerchantRecord storage record = merchants[merchantId];
        if (record.payoutAddress == address(0)) revert MerchantNotFound(merchantId);

        record.isActive = active;
        emit MerchantStatusToggled(merchantId, active);
    }

    /**
     * @notice Read-only check for merchant validity and payout destination.
     */
    function isMerchantActive(bytes32 merchantId) external view returns (bool isActive, address payoutAddress) {
        MerchantRecord storage record = merchants[merchantId];
        return (record.isActive && !paused(), record.payoutAddress);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}

