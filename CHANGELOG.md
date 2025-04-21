# Changelog

## [1.0.0] - 2025-04-21

### Breaking Changes
- Contracts were re-deployed due to issues with multisig upgrades (see bug fixes below)
- Claiming WIP now requires voting with minimum 32 WIP spend to claim 64 WIP
- Claiming after inactivity now reduces rewards by 1/4 of the CLAIMABLE_AMOUNT each day
- Added `_disableInitializers` to `WorldMultiSig` constructor
- Added `isTest` parameter to `WorldMultiSig` constructor to allow for testing
- added `_disableInitializers` to `WIP` constructor
- added `isTest` parameter to `WIP` constructor to allow for testing
- Removed `WorldDistribution` contract and replaced with more sophisticated off-chain deployment logic instead
- Removed `initialOperator` from `WIP` initializer

### New Features
- Added `expiresAt` and `IssuingState` to `Verified` event
- Added `getHolderInfo` function
- Added `daysSinceLastClaim` parameter

### Bug Fixes
- Fixed bug that did not add countries to global multiSig
- Onboarding bonus is now calculated correctly (increments number of onboarded users before issuing bonus)

### Improvements
- Inactivity penalty improves fairness by rewarding active users (16 WIP more per day) compared to inactive users who claim occasionally without voting
- Contracts are now fully verified on Etherscan
- Contracts are now more gas efficient (20000 runs optimizer enabled)
- Contracts are now more readable (removed unused code)
- Better event logging

## [0.0.1] - 2023-MM-DD

- Initial release