// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

// Pulls Semaphore V4 (PSE, MIT) into this Hardhat build so it can be deployed
// to Robinhood Chain alongside our own contracts.
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
