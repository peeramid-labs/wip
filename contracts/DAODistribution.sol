// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CloneDistribution} from "@peeramid-labs/eds/src/abstracts/CloneDistribution.sol";
import "@peeramid-labs/eds/src/libraries/LibSemver.sol";
import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";
import {GovernanceToken} from "./GovernanceToken.sol";
import {WORLD_DAO} from "./DAO.sol";

/**
 * @title DAODistribution
 * @notice This contract implements a country-specific DAO distribution system for the World Improvement Proposals (WIP).
 *         It creates and manages instances of WORLD_DAO and GovernanceToken contracts, enabling decentralized
 *         governance with voting capabilities for each participating country.
 * @dev This contract extends CloneDistribution to deploy and initialize pairs of governance tokens and DAOs.
 *      Each country in the WIP ecosystem gets its own token and DAO for local governance.
 * @author Peeramid Labs, 2024
 * @custom:security-contact sirt@peeramid.xyz
 */

/**
 * @notice Data structure required for instantiating a new DAO for a country
 * @param issuingState Hashed identifier of the issuing state/country
 * @param stateName Human-readable name of the state/country
 * @param godFather Address of the initial authority/creator for the country's governance
 */
struct InstantiationData {
    bytes32 issuingState;
    string stateName;
    string stateShortName;
    address godFather;
}

contract DAODistribution is CloneDistribution {
    using ShortStrings for ShortString;

    /// @notice Address of the base WORLD_DAO implementation that will be cloned
    address private immutable _daoBase;
    /// @notice Address of the base GovernanceToken implementation that will be cloned
    address private immutable _governanceTokenBase;

    /// @notice Name of this distribution contract, stored as ShortString for gas efficiency
    ShortString private immutable _distributionName;
    /// @notice Version of this distribution contract following semantic versioning
    uint256 private immutable _distributionVersion;

    /**
     * @dev Utility function to convert function signature strings to selectors
     * @param signature The function signature as a string
     * @return bytes4 The corresponding function selector
     */
    function stringToSelector(string memory signature) private pure returns (bytes4) {
        return bytes4(keccak256(bytes(signature)));
    }

    /**
     * @dev Constructor for the DAODistribution contract
     * @param daoBase Address of the WORLD_DAO implementation that will be cloned
     * @param governanceTokenBase Address of the GovernanceToken implementation that will be cloned
     * @param distributionName Name for this distribution (must be less than 31 bytes)
     * @param version Semantic version for this distribution
     * @notice Sets up the distribution system with references to all required implementation contracts
     * @dev WARNING: distributionName must be less than 31 bytes long to comply with ShortStrings immutable format
     */
    constructor(
        address daoBase,
        address governanceTokenBase,
        string memory distributionName,
        LibSemver.Version memory version
    ) {
        _daoBase = daoBase;
        _governanceTokenBase = governanceTokenBase;
        _distributionName = ShortStrings.toShortString(distributionName);
        _distributionVersion = LibSemver.toUint256(version);
    }

    /**
     * @notice Creates a new DAO and GovernanceToken pair for a country
     * @dev Clones both DAO and token contracts and initializes them with country-specific data
     * @param data Encoded InstantiationData containing country information and initial governance authority
     * @return instances Array of deployed contract addresses [GovernanceToken, WORLD_DAO]
     * @return distributionName Name of this distribution as bytes32
     * @return distributionVersion Version of this distribution as uint256
     * @custom:security Sets msg.sender (WIP contract) as the token minter
     */
    function instantiate(
        bytes memory data
    ) external override returns (address[] memory instances, bytes32 distributionName, uint256 distributionVersion) {
        (instances, distributionName, distributionVersion) = super._instantiate();
        InstantiationData memory instantiationData = abi.decode(data, (InstantiationData));
        GovernanceToken(instances[0]).initialize(
            instantiationData.godFather,
            instantiationData.stateName,
            instantiationData.stateShortName,
            instances[1],
            msg.sender
        );
        WORLD_DAO(payable(instances[1])).initialize(GovernanceToken(instances[0]));
        return (instances, distributionName, distributionVersion);
    }

    /**
     * @notice Returns the contract URI for this distribution
     * @dev Used for metadata and discovery purposes
     * @return string The contract URI
     */
    function contractURI() public pure virtual override returns (string memory) {
        return string(abi.encodePacked("DAODistribution"));
    }

    /**
     * @notice Public accessor for sources data
     * @dev Wrapper around the internal sources function
     * @return address[] Array of source implementation addresses
     * @return bytes32 Distribution name
     * @return uint256 Distribution version
     */
    function get() public view virtual override returns (address[] memory, bytes32, uint256) {
        return sources();
    }

    /**
     * @notice Returns the implementation addresses and metadata for this distribution
     * @dev Implements the required sources function from CloneDistribution
     * @return address[] Array containing [governanceTokenBase, daoBase] addresses
     * @return bytes32 Distribution name
     * @return uint256 Distribution version
     */
    function sources() internal view virtual override returns (address[] memory, bytes32, uint256) {
        address[] memory srcs = new address[](2);
        srcs[0] = _governanceTokenBase;
        srcs[1] = _daoBase;
        return (srcs, ShortString.unwrap(_distributionName), _distributionVersion);
    }
}
