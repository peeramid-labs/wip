// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CloneDistribution} from "@peeramid-labs/eds/src/abstracts/CloneDistribution.sol";
import "@peeramid-labs/eds/src/libraries/LibSemver.sol";
import {ShortStrings, ShortString} from "@openzeppelin/contracts/utils/ShortStrings.sol";
import {GovernanceToken} from "./GovernanceToken.sol";
import {WORLD_DAO} from "./DAO.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {WIP} from "./WIP.sol";
/**
 * @title WorldDistribution
 * @notice This contract implements a proxied distribution system for the World Improvement Proposals (WIP).
 *         It creates and manages instances of WIP contracts and WorldMultiSig, enabling a decentralized
 *         citizenship-based governance system across multiple countries.
 * @dev This contract extends CloneDistribution and deploys transparent upgradeable proxies for the WIP
 *      and WorldMultiSig contracts. It serves as the factory for creating new World identity ecosystems.
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
    address godFather;
}

contract WorldDistribution is CloneDistribution {
    using ShortStrings for ShortString;

    /// @notice Address of the DAODistribution contract used for deploying country-specific DAOs
    address private immutable _daoDistribution;
    /// @notice Address of the base WIP implementation that will be proxied
    address private immutable _wipBase;
    /// @notice Address of the base WorldMultiSig implementation that will be proxied
    address private immutable _worldMultiSig;
    /// @notice Address of the verifier contract used for passport verification
    address private immutable _verifier;

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
     * @dev Constructor for the WorldDistribution contract
     * @param daoDistribution Address of the DAODistribution contract for deploying country DAOs
     * @param verifier Address of the passport verification contract
     * @param wipBase Address of the WIP implementation that will be proxied
     * @param worldMultiSig Address of the WorldMultiSig implementation that will be proxied
     * @param distributionName Name for this distribution (must be less than 31 bytes)
     * @param version Semantic version for this distribution
     * @notice Sets up the distribution system with references to all required implementation contracts
     * @dev WARNING: distributionName must be less than 31 bytes long to comply with ShortStrings immutable format
     */
    constructor(
        address daoDistribution,
        address verifier,
        address wipBase,
        address worldMultiSig,
        string memory distributionName,
        LibSemver.Version memory version
    ) {
        _distributionName = ShortStrings.toShortString(distributionName);
        _distributionVersion = LibSemver.toUint256(version);
        _daoDistribution = daoDistribution;
        _verifier = verifier;
        _wipBase = wipBase;
        _worldMultiSig = worldMultiSig;
    }

    /**
     * @notice Allows a WorldMultiSig contract to call itself with arbitrary data
     * @dev This method enables self-upgrading functionality for the WorldMultiSig
     * @param data The calldata to execute
     * @param destination The target address (must be the caller itself)
     * @custom:security Only callable by the destination address itself
     */
    function callSelf(bytes memory data, address destination) public {
        require(msg.sender == destination, "Only destination can call self");
        (bool success, ) = address(destination).call(data);
        require(success, "Call failed");
    }

    /**
     * @notice Event emitted when a new World ecosystem is instantiated
     * @param worldMultiSig Address of the deployed WorldMultiSig proxy
     * @param wip Address of the deployed WIP proxy
     */
    event InstantiateWorld(address indexed worldMultiSig, address indexed wip);

    /**
     * @notice Creates a new World ecosystem with WIP and WorldMultiSig contracts
     * @dev Deploys proxies for both WIP and WorldMultiSig and initializes them
     * @return instances Array of deployed contract addresses [WIP, WorldMultiSig]
     * @return distributionName Name of this distribution as bytes32
     * @return distributionVersion Version of this distribution as uint256
     * @custom:security Sets msg.sender as the initial operator of the WorldMultiSig
     */
    function instantiate(
        bytes memory
    ) external override returns (address[] memory instances, bytes32 distributionName, uint256 distributionVersion) {
        address multisig = address(new TransparentUpgradeableProxy(_worldMultiSig, address(this), ""));
        require(multisig != address(0), "Multisig deployment failed");
        WIP wip = WIP(address(new TransparentUpgradeableProxy(_wipBase, multisig, "")));
        require(address(wip) != address(0), "WIP deployment failed");
        wip.initialize(_verifier, _daoDistribution, multisig, msg.sender);
        require(address(wip.worldMultiSig()) == multisig, "WIP deployment failed");
        instances = new address[](2);
        instances[0] = address(wip);
        instances[1] = address(multisig);

        emit InstantiateWorld(multisig, address(wip));

        return (instances, ShortString.unwrap(_distributionName), distributionVersion);
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
     * @return address[] Array containing [wipBase, worldMultiSig] addresses
     * @return bytes32 Distribution name
     * @return uint256 Distribution version
     */
    function sources() internal view virtual override returns (address[] memory, bytes32, uint256) {
        address[] memory srcs = new address[](2);
        srcs[0] = _wipBase;
        srcs[1] = _worldMultiSig;
        return (srcs, ShortString.unwrap(_distributionName), _distributionVersion);
    }
}
