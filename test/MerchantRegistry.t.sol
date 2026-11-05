// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MerchantRegistry} from "../contracts/MerchantRegistry.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MerchantRegistryTest is Test {
    MerchantRegistry public registry;
    address public admin = address(0xAD);
    address public merchantPayout = address(0xCAFE);
    address public newPayout = address(0xBEEF);
    address public stranger = address(0x999);

    bytes32 public constant SAMPLE_MERCHANT_ID = keccak256("BLUE_BOTTLE_COFFEE_01");

    function setUp() public {
        vm.prank(admin);
        registry = new MerchantRegistry(admin);
    }

    function test_RegisterMerchant_HappyPath() public {
        vm.prank(admin);
        registry.registerMerchant(SAMPLE_MERCHANT_ID, merchantPayout);

        (bool isActive, address payout) = registry.isMerchantActive(SAMPLE_MERCHANT_ID);
        assertTrue(isActive);
        assertEq(payout, merchantPayout);
    }

    function test_RegisterMerchant_Revert_NonOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        registry.registerMerchant(SAMPLE_MERCHANT_ID, merchantPayout);
    }

    function test_RegisterMerchant_Revert_ZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(MerchantRegistry.ZeroAddress.selector);
        registry.registerMerchant(SAMPLE_MERCHANT_ID, address(0));
    }

    function test_UpdatePayoutAddress_ByMerchant() public {
        vm.prank(admin);
        registry.registerMerchant(SAMPLE_MERCHANT_ID, merchantPayout);

        vm.prank(merchantPayout);
        registry.updatePayoutAddress(SAMPLE_MERCHANT_ID, newPayout);

        (, address payout) = registry.isMerchantActive(SAMPLE_MERCHANT_ID);
        assertEq(payout, newPayout);
    }

    function test_UpdatePayoutAddress_Revert_Unauthorized() public {
        vm.prank(admin);
        registry.registerMerchant(SAMPLE_MERCHANT_ID, merchantPayout);

        vm.prank(stranger);
        vm.expectRevert(MerchantRegistry.UnauthorizedCaller.selector);
        registry.updatePayoutAddress(SAMPLE_MERCHANT_ID, newPayout);
    }

    function test_SetMerchantActive_Toggle() public {
        vm.prank(admin);
        registry.registerMerchant(SAMPLE_MERCHANT_ID, merchantPayout);

        // Deactivate
        vm.prank(admin);
        registry.setMerchantActive(SAMPLE_MERCHANT_ID, false);
        (bool isActive, ) = registry.isMerchantActive(SAMPLE_MERCHANT_ID);
        assertFalse(isActive);

        // Reactivate
        vm.prank(admin);
        registry.setMerchantActive(SAMPLE_MERCHANT_ID, true);
        (isActive, ) = registry.isMerchantActive(SAMPLE_MERCHANT_ID);
        assertTrue(isActive);
    }

    function test_Pause_RevertsWhenPaused() public {
        vm.prank(admin);
        registry.registerMerchant(SAMPLE_MERCHANT_ID, merchantPayout);

        vm.prank(admin);
        registry.pause();

        // When paused, isMerchantActive returns false
        (bool isActive, ) = registry.isMerchantActive(SAMPLE_MERCHANT_ID);
        assertFalse(isActive);

        // Registering while paused reverts
        vm.prank(admin);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        registry.registerMerchant(keccak256("OTHER"), newPayout);
    }
}

