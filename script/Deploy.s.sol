// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CardRegistry} from "../contracts/CardRegistry.sol";
import {MerchantRegistry} from "../contracts/MerchantRegistry.sol";
import {MockUSDC} from "../contracts/mock/MockUSDC.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== PaidX Sepolia Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy CardRegistry
        CardRegistry cardRegistry = new CardRegistry(deployer);
        console.log("CardRegistry deployed at:", address(cardRegistry));

        // 2. Deploy MerchantRegistry
        MerchantRegistry merchantRegistry = new MerchantRegistry(deployer);
        console.log("MerchantRegistry deployed at:", address(merchantRegistry));

        // 3. Optional MockUSDC
        bool deployMock = vm.envOr("DEPLOY_MOCK_TOKEN", false);
        address paymentToken;
        if (deployMock) {
            MockUSDC mockUsdc = new MockUSDC();
            paymentToken = address(mockUsdc);
            console.log("MockUSDC deployed at:", paymentToken);
        } else {
            paymentToken = vm.envOr("NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS", address(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238));
            console.log("Using official Sepolia USDC at:", paymentToken);
        }

        vm.stopBroadcast();

        // 4. Format deployments JSON output
        string memory json = vm.serializeAddress("deployment", "cardRegistry", address(cardRegistry));
        json = vm.serializeAddress("deployment", "merchantRegistry", address(merchantRegistry));
        json = vm.serializeAddress("deployment", "paymentToken", paymentToken);
        json = vm.serializeAddress("deployment", "deployer", deployer);
        string memory finalJson = vm.serializeUint("deployment", "chainId", block.chainid);

        string memory filePath = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeFile(filePath, finalJson);
        console.log("Deployment manifest saved to:", filePath);
    }
}

