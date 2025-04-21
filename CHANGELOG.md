# Changelog

## [1.0.0] - 2025-04-21

### Breaking Changes
- Contracts were re-deployed due to issues with multisig upgrades (see bug fixes below)
- Claiming WIP now requires voting with minimum 32 WIP spend to claim 64 WIP
- Claiming after inactivity now reduces rewards by 1/4 of the CLAIMABLE_AMOUNT each day

### New Features
- Added `expiresAt` and `IssuingState` to `Verified` event
- Added `getHolderInfo` function
- Added `daysSinceLastClaim` parameter

### Bug Fixes
- Fixed bug that did not add countries to global multiSig
- Onboarding bonus is now calculated correctly (increments number of onboarded users before issuing bonus)

### Improvements
- Inactivity penalty improves fairness by rewarding active users (16 WIP more per day) compared to inactive users who claim occasionally without voting

## [0.0.1] - 2023-MM-DD

- Initial release