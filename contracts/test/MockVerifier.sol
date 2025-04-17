// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVcAndDiscloseCircuitVerifier} from "@selfxyz/contracts/contracts/interfaces/IVcAndDiscloseCircuitVerifier.sol";
import "./IVcAndDiscloseCircuitVerifierMock.sol";

/**
 * @title MockVerifier
 * @dev Mock implementation of the Verifier contract for testing
 */
contract MockVerifier {
    struct ReadableRevealedData {
        string issuingState;
        string dateOfBirth;
        string dateOfExpiry;
        string documentNumber;
        string fullName;
    }

    // Return values that can be set for tests
    ReadableRevealedData public returnRevealedData;
    uint256 public returnExpiresAt;
    bool public returnIsExpired;
    string public returnIssuingState;
    address public returnCitizen;

    // For forcing reverts in tests
    bool public shouldRevert;
    string public revertMessage;

    constructor() {
        // Initialize with default values
        returnRevealedData = ReadableRevealedData({
            issuingState: "TestCountry",
            dateOfBirth: "19900101",
            dateOfExpiry: "20300101",
            documentNumber: "ABC123456",
            fullName: "Test User"
        });
        returnExpiresAt = block.timestamp + 365 days;
        returnIsExpired = false;
        returnIssuingState = "TestCountry";
        returnCitizen = msg.sender;
    }

    function mockSetReturnValues(
        ReadableRevealedData memory _revealedData,
        uint256 _expiresAt,
        bool _isExpired,
        string memory _issuingState,
        address _citizen
    ) external {
        returnRevealedData = _revealedData;
        returnExpiresAt = _expiresAt;
        returnIsExpired = _isExpired;
        returnIssuingState = _issuingState;
        returnCitizen = _citizen;
    }

    // A convenience function to set multiple values at once using a struct
    function mockSetReturnValues(MockReturnValues memory values) external {
        returnRevealedData = values.revealedData;
        returnExpiresAt = values.expiresAt;
        returnIsExpired = values.isExpired;
        returnIssuingState = values.issuingState;
        returnCitizen = values.citizen;
    }

    // Struct to simplify setting return values in tests
    struct MockReturnValues {
        ReadableRevealedData revealedData;
        uint256 expiresAt;
        bool isExpired;
        string issuingState;
        address citizen;
    }

    // A method to make the mock revert with a specific message
    function mockSetReturnWithRevert(bool _shouldRevert, string memory _revertMessage) external {
        shouldRevert = _shouldRevert;
        revertMessage = _revertMessage;
    }

    // Mock implementation of verifySelfProofAndReturn
    // Accepts any proof format, only uses the mocked values
    function verifySelfProofAndReturn(
        IVcAndDiscloseCircuitVerifier.VcAndDiscloseProof calldata /* proof */
    )
        external
        view
        returns (
            ReadableRevealedData memory revealedData,
            uint256 expiresAt,
            bool isExpired,
            string memory issuingState,
            address citizen
        )
    {
        // If we're configured to revert, do so with the specified message
        if (shouldRevert) {
            revert(revertMessage);
        }

        return (returnRevealedData, returnExpiresAt, returnIsExpired, returnIssuingState, returnCitizen);
    }

    // Mock implementation of verifySelfProof
    // Accepts any proof format, only checks if expired
    function verifySelfProof(IVcAndDiscloseCircuitVerifier.VcAndDiscloseProof calldata /* proof */) external view {
        // If we're configured to revert, do so with the specified message
        if (shouldRevert) {
            revert(revertMessage);
        }

        if (returnIsExpired) {
            revert("Not eligible: Expired");
        }
    }
}
