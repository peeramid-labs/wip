// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IVcAndDiscloseCircuitVerifierMock {
    struct VcAndDiscloseProof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256[] pubSignals;
    }
}
