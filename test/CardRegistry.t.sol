// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CardRegistry} from "../contracts/CardRegistry.sol";

contract CardRegistryTest is Test {
    CardRegistry public registry;
    address public admin = address(0xAD);
    address public userAlice = address(0xA11CE);
    address public userBob = address(0xB0B);

    bytes32 public constant SAMPLE_CARD_HASH = keccak256("NFC_UID_TEST_123");

    function setUp() public {
        vm.prank(admin);
        registry = new CardRegistry(admin);
    }

    function test_RegisterCard_HappyPath() public {
        vm.prank(userAlice);
        registry.registerCard(SAMPLE_CARD_HASH, userAlice);

        (bool isActive, address owner) = registry.verifyCardActive(SAMPLE_CARD_HASH);
        assertTrue(isActive);
        assertEq(owner, userAlice);

        bytes32[] memory owned = registry.getOwnerCards(userAlice);
        assertEq(owned.length, 1);
        assertEq(owned[0], SAMPLE_CARD_HASH);
    }

    function test_RegisterCard_Revert_Duplicate() public {
        registry.registerCard(SAMPLE_CARD_HASH, userAlice);

        vm.expectRevert(abi.encodeWithSelector(CardRegistry.CardAlreadyRegistered.selector, SAMPLE_CARD_HASH));
        registry.registerCard(SAMPLE_CARD_HASH, userBob);
    }

    function test_RegisterCard_Revert_ZeroAddress() public {
        vm.expectRevert(CardRegistry.ZeroAddress.selector);
        registry.registerCard(SAMPLE_CARD_HASH, address(0));
    }

    function test_RegisterCard_Revert_ZeroHash() public {
        vm.expectRevert(CardRegistry.ZeroHash.selector);
        registry.registerCard(bytes32(0), userAlice);
    }

    function test_SetCardStatus_FreezeAndUnfreeze() public {
        registry.registerCard(SAMPLE_CARD_HASH, userAlice);

        // Alice freezes her card
        vm.prank(userAlice);
        registry.setCardStatus(SAMPLE_CARD_HASH, CardRegistry.CardStatus.Frozen);

        (bool isActive, address owner) = registry.verifyCardActive(SAMPLE_CARD_HASH);
        assertFalse(isActive);
        assertEq(owner, userAlice);

        // Alice unfreezes
        vm.prank(userAlice);
        registry.setCardStatus(SAMPLE_CARD_HASH, CardRegistry.CardStatus.Active);
        (isActive, ) = registry.verifyCardActive(SAMPLE_CARD_HASH);
        assertTrue(isActive);
    }

    function test_SetCardStatus_Revert_Unauthorized() public {
        registry.registerCard(SAMPLE_CARD_HASH, userAlice);

        vm.prank(userBob);
        vm.expectRevert(CardRegistry.UnauthorizedCaller.selector);
        registry.setCardStatus(SAMPLE_CARD_HASH, CardRegistry.CardStatus.Frozen);
    }

    function test_SetCardStatus_Revert_AfterRevoked() public {
        registry.registerCard(SAMPLE_CARD_HASH, userAlice);

        vm.prank(userAlice);
        registry.setCardStatus(SAMPLE_CARD_HASH, CardRegistry.CardStatus.Revoked);

        // Cannot transition out of Revoked
        vm.prank(userAlice);
        vm.expectRevert(CardRegistry.InvalidStatusTransition.selector);
        registry.setCardStatus(SAMPLE_CARD_HASH, CardRegistry.CardStatus.Active);
    }

    function testFuzz_RegisterCard(bytes32 cardHash, address owner) public {
        vm.assume(cardHash != bytes32(0));
        vm.assume(owner != address(0));

        registry.registerCard(cardHash, owner);
        (bool isActive, address registeredOwner) = registry.verifyCardActive(cardHash);

        assertTrue(isActive);
        assertEq(registeredOwner, owner);
    }
}

