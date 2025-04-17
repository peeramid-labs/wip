// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SelfVerificationRoot} from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import {ISelfVerificationRoot} from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import {IVcAndDiscloseCircuitVerifier} from "@selfxyz/contracts/contracts/interfaces/IVcAndDiscloseCircuitVerifier.sol";
import {IIdentityVerificationHubV1} from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV1.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Formatter} from "@selfxyz/contracts/contracts/libraries/Formatter.sol";
import {CircuitAttributeHandler} from "@selfxyz/contracts/contracts/libraries/CircuitAttributeHandler.sol";
import {CircuitConstants} from "@selfxyz/contracts/contracts/constants/CircuitConstants.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {IDistribution} from "@peeramid-labs/eds/src/interfaces/IDistribution.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// import "@celo/contracts/common/UsingRegistryV2.sol";
import {InstantiationData} from "./DAODistribution.sol";
import {GovernanceToken} from "./GovernanceToken.sol";
struct ReadableRevealedData {
    string issuingState;
    string[] name;
    string passportNumber;
    string nationality;
    string dateOfBirth;
    string gender;
    string expiryDate;
    uint256 olderThan;
    uint256 passportNoOfac;
    uint256 nameAndDobOfac;
    uint256 nameAndYobOfac;
}
enum RevealedDataType {
    ISSUING_STATE, // The issuing state of the passport.
    NAME, // The full name of the passport holder.
    PASSPORT_NUMBER, // The passport number.
    NATIONALITY, // The nationality.
    DATE_OF_BIRTH, // The date of birth.
    GENDER, // The gender.
    EXPIRY_DATE, // The passport expiry date.
    OLDER_THAN, // The "older than" age verification value.
    PASSPORT_NO_OFAC, // The passport number OFAC status.
    NAME_AND_DOB_OFAC, // The name and date of birth OFAC status.
    NAME_AND_YOB_OFAC // The name and year of birth OFAC status.
}

contract Verifier is SelfVerificationRoot {
    error RegisteredNullifier();
    error NotQualified(address account);
    error AlreadyClaimed();
    mapping(uint256 => bool) _nullifiers;

    constructor(
        address _identityVerificationHub,
        uint256 _scope,
        uint256 _attestationId,
        bool _olderThanEnabled,
        uint256 _olderThan,
        bool _forbiddenCountriesEnabled,
        uint256[4] memory _forbiddenCountriesListPacked,
        bool[3] memory _ofacEnabled
    )
        SelfVerificationRoot(
            _identityVerificationHub,
            _scope,
            _attestationId,
            _olderThanEnabled,
            _olderThan,
            _forbiddenCountriesEnabled,
            _forbiddenCountriesListPacked,
            _ofacEnabled
        )
    {}

    function verifySelfProofAndReturn(
        IVcAndDiscloseCircuitVerifier.VcAndDiscloseProof memory proof
    ) public returns (ReadableRevealedData memory, uint256, bool, string memory, address) {
        if (_scope != proof.pubSignals[CircuitConstants.VC_AND_DISCLOSE_SCOPE_INDEX]) {
            revert InvalidScope();
        }

        if (_attestationId != proof.pubSignals[CircuitConstants.VC_AND_DISCLOSE_ATTESTATION_ID_INDEX]) {
            revert InvalidAttestationId();
        }

        if (_nullifiers[proof.pubSignals[CircuitConstants.VC_AND_DISCLOSE_NULLIFIER_INDEX]]) {
            revert RegisteredNullifier();
        }

        IIdentityVerificationHubV1.VcAndDiscloseVerificationResult memory result = _identityVerificationHub
            .verifyVcAndDisclose(
                IIdentityVerificationHubV1.VcAndDiscloseHubProof({
                    olderThanEnabled: _verificationConfig.olderThanEnabled,
                    olderThan: _verificationConfig.olderThan,
                    forbiddenCountriesEnabled: _verificationConfig.forbiddenCountriesEnabled,
                    forbiddenCountriesListPacked: _verificationConfig.forbiddenCountriesListPacked,
                    ofacEnabled: _verificationConfig.ofacEnabled,
                    vcAndDiscloseProof: proof
                })
            );

        (uint256 expiresAt, bool isExpired) = _getExpiryDate(result.revealedDataPacked);

        RevealedDataType[] memory types = new RevealedDataType[](1);
        types[0] = RevealedDataType.ISSUING_STATE;

        ReadableRevealedData memory revealedData = getReadableRevealedData(result.revealedDataPacked, types);

        _nullifiers[result.nullifier] = true;
        if (!isExpired) {
            return (
                revealedData,
                expiresAt,
                isExpired,
                revealedData.issuingState,
                address(uint160(result.userIdentifier))
            );
        } else {
            revert("Not eligible: Expired");
        }
    }

    // This function is used to verify the proof for the DAO citizen.
    // It will not write nullifier to storage, use function above for that.
    function verifySelfProof(IVcAndDiscloseCircuitVerifier.VcAndDiscloseProof memory proof) public view override {
        if (_scope != proof.pubSignals[CircuitConstants.VC_AND_DISCLOSE_SCOPE_INDEX]) {
            revert InvalidScope();
        }

        if (_attestationId != proof.pubSignals[CircuitConstants.VC_AND_DISCLOSE_ATTESTATION_ID_INDEX]) {
            revert InvalidAttestationId();
        }

        if (_nullifiers[proof.pubSignals[CircuitConstants.VC_AND_DISCLOSE_NULLIFIER_INDEX]]) {
            revert RegisteredNullifier();
        }

        IIdentityVerificationHubV1.VcAndDiscloseVerificationResult memory result = _identityVerificationHub
            .verifyVcAndDisclose(
                IIdentityVerificationHubV1.VcAndDiscloseHubProof({
                    olderThanEnabled: _verificationConfig.olderThanEnabled,
                    olderThan: _verificationConfig.olderThan,
                    forbiddenCountriesEnabled: _verificationConfig.forbiddenCountriesEnabled,
                    forbiddenCountriesListPacked: _verificationConfig.forbiddenCountriesListPacked,
                    ofacEnabled: _verificationConfig.ofacEnabled,
                    vcAndDiscloseProof: proof
                })
            );

        (, bool isExpired) = _getExpiryDate(result.revealedDataPacked);

        RevealedDataType[] memory types = new RevealedDataType[](1);
        types[0] = RevealedDataType.ISSUING_STATE;

        if (isExpired) {
            revert("Not eligible: Expired");
        }
    }

    function getReadableRevealedData(
        uint256[3] memory revealedDataPacked,
        RevealedDataType[] memory types
    ) internal view virtual returns (ReadableRevealedData memory) {
        bytes memory charcodes = Formatter.fieldElementsToBytes(revealedDataPacked);

        ReadableRevealedData memory attrs;

        for (uint256 i = 0; i < types.length; i++) {
            RevealedDataType dataType = types[i];
            if (dataType == RevealedDataType.ISSUING_STATE) {
                attrs.issuingState = CircuitAttributeHandler.getIssuingState(charcodes);
            } else if (dataType == RevealedDataType.NAME) {
                attrs.name = CircuitAttributeHandler.getName(charcodes);
            } else if (dataType == RevealedDataType.PASSPORT_NUMBER) {
                attrs.passportNumber = CircuitAttributeHandler.getPassportNumber(charcodes);
            } else if (dataType == RevealedDataType.NATIONALITY) {
                attrs.nationality = CircuitAttributeHandler.getNationality(charcodes);
            } else if (dataType == RevealedDataType.DATE_OF_BIRTH) {
                attrs.dateOfBirth = CircuitAttributeHandler.getDateOfBirth(charcodes);
            } else if (dataType == RevealedDataType.GENDER) {
                attrs.gender = CircuitAttributeHandler.getGender(charcodes);
            } else if (dataType == RevealedDataType.EXPIRY_DATE) {
                attrs.expiryDate = CircuitAttributeHandler.getExpiryDate(charcodes);
            } else if (dataType == RevealedDataType.OLDER_THAN) {
                attrs.olderThan = CircuitAttributeHandler.getOlderThan(charcodes);
            } else if (dataType == RevealedDataType.PASSPORT_NO_OFAC) {
                attrs.passportNoOfac = CircuitAttributeHandler.getPassportNoOfac(charcodes);
            } else if (dataType == RevealedDataType.NAME_AND_DOB_OFAC) {
                attrs.nameAndDobOfac = CircuitAttributeHandler.getNameAndDobOfac(charcodes);
            } else if (dataType == RevealedDataType.NAME_AND_YOB_OFAC) {
                attrs.nameAndYobOfac = CircuitAttributeHandler.getNameAndYobOfac(charcodes);
            }
        }

        return attrs;
    }

    function _getExpiryDate(
        uint256[3] memory revealedDataPacked
    ) internal view returns (uint256 expiresAt, bool isExpired) {
        bytes memory charcodes = Formatter.fieldElementsToBytes(revealedDataPacked);
        string memory expiry = CircuitAttributeHandler.getExpiryDate(charcodes);

        bytes memory expiryBytes = bytes(expiry);
        bytes memory dayBytes = new bytes(2);
        bytes memory monthBytes = new bytes(2);
        bytes memory yearBytes = new bytes(2);

        dayBytes[0] = expiryBytes[0];
        dayBytes[1] = expiryBytes[1];

        monthBytes[0] = expiryBytes[3];
        monthBytes[1] = expiryBytes[4];

        yearBytes[0] = expiryBytes[6];
        yearBytes[1] = expiryBytes[7];

        string memory day = string(dayBytes);
        string memory month = string(monthBytes);
        string memory year = string(yearBytes);

        uint256 expiryTimestamp = Formatter.dateToUnixTimestamp(string(abi.encodePacked(year, month, day)));

        uint256 currentTime = block.timestamp;

        if (currentTime > expiryTimestamp) {
            isExpired = true;
        } else {
            isExpired = false;
        }

        return (expiryTimestamp, isExpired);
    }
}
