// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVcAndDiscloseCircuitVerifier} from "@selfxyz/contracts/contracts/interfaces/IVcAndDiscloseCircuitVerifier.sol";
import {IDistribution} from "@peeramid-labs/eds/src/interfaces/IDistribution.sol";
import {InstantiationData} from "./DAODistribution.sol";
import {GovernanceToken} from "./GovernanceToken.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {ERC20BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Verifier, ReadableRevealedData} from "./Verifier.sol";
import {WorldMultiSigV1} from "./WorldMultiSig.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @notice Structure representing a vote for a proposal
 * @param proposal Hash of the proposal being voted on
 * @param scoresGiven Amount of voting power allocated to this proposal
 */
struct VoteElement {
    bytes32 proposal;
    uint256 scoresGiven;
}

/**
 * @notice Structure representing a passport holder's citizenship information
 * @param citizenship String identifier of the country of citizenship
 * @param revalidateAt Timestamp when the passport needs to be reverified
 * @param isQualified Boolean indicating if the passport holder is eligible for participation
 */
struct PassportHolder {
    string citizenship;
    uint256 revalidateAt;
    bool isQualified;
}

/**
 * @notice Structure representing a single proposal in the system
 * @param proposal Hash of the proposal text
 * @param score Current score/votes accumulated for this proposal
 * @param proposer Address of the account that submitted the proposal
 * @param exists Boolean to track if this proposal exists (used for lookups)
 */
struct DailyProposal {
    bytes32 proposal;
    uint256 score;
    address proposer;
    bool exists;
}

/**
 * @notice Structure to track proposals for a specific day
 * @param proposals Mapping from proposal hash to DailyProposal data
 * @param proposalCnt Number of proposals submitted on this day
 */
struct Daily {
    mapping(bytes32 proposal => DailyProposal) proposals;
    uint256 proposalCnt;
}

/**
 * @notice Structure representing a country's DAO and governance token
 * @param token The governance token for this country
 * @param dao Address of the DAO contract for this country
 * @param bonusBase Remaining tokens available for issuance to new citizens
 */
struct DAO {
    GovernanceToken token;
    address dao;
    uint256 bonusBase;
    uint256 verifiedCount;
}

/**
 * @notice Main storage structure for the WIP contract using the diamond storage pattern
 * @dev Used to avoid storage collisions in upgradeable contracts
 */
struct WIPStorage {
    Verifier verifier;
    IDistribution daoDistribution;
    mapping(bytes32 state => DAO) daos;
    mapping(uint256 => bool) _nullifiers;
    mapping(address => PassportHolder) passportHolders;
    mapping(uint256 day => Daily) daily;
    mapping(bytes32 proposal => uint256 score) proposalScores;
    WorldMultiSigV1 worldMultiSig;
    uint256 lastProposalDay;
    mapping(address => uint256) lastClaimed;
}

/**
 * @title World Improvement Proposals (WIP)
 * @notice Main contract for the World Improvement Proposals system, enabling citizenship-based
 *         governance across multiple countries with democratic proposal and voting mechanisms.
 * @dev Implements an upgradeable ERC20 token with specialized governance features including:
 *      - Passport verification for citizenship
 *      - Country-specific DAOs and tokens
 *      - Daily proposal submissions
 *      - Cross-country and same-country voting with quadratic/cubic scoring
 * @author Peeramid Labs, 2024
 * @custom:security-contact sirt@peeramid.xyz
 */
contract WIP is ERC20BurnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    /**
     * @notice Retrieves the passport holder information for a given account
     * @param account Address to query passport information for
     * @return PassportHolder Struct containing citizenship data
     */
    function passportHolders(address account) public view returns (PassportHolder memory) {
        return getStorage().passportHolders[account];
    }

    /**
     * @notice Retrieves the DAO information for a given country
     * @param state Hashed identifier of the country
     * @return DAO Struct containing governance token and DAO details
     */
    function daos(bytes32 state) public view returns (DAO memory) {
        return getStorage().daos[state];
    }

    /**
     * @notice Returns the WorldMultiSig contract instance
     * @return WorldMultiSigV1 The WorldMultiSig contract for governance control
     */
    function worldMultiSig() public view returns (WorldMultiSigV1) {
        return getStorage().worldMultiSig;
    }

    /**
     * @notice Checks if a nullifier has been used
     * @param nullifier The nullifier value to check
     * @return bool True if the nullifier has been used
     */
    function nullifiers(uint256 nullifier) public view returns (bool) {
        return getStorage()._nullifiers[nullifier];
    }

    /**
     * @notice Gets the total score for a proposal
     * @param proposal Hash of the proposal to query
     * @return uint256 Current score/votes for the proposal
     */
    function proposalScores(bytes32 proposal) public view returns (uint256) {
        return getStorage().proposalScores[proposal];
    }

    /**
     * @notice Returns the DAODistribution contract instance
     * @return IDistribution The DAO distribution contract
     */
    function daoDistribution() public view returns (IDistribution) {
        return getStorage().daoDistribution;
    }

    /// @notice Amount of tokens claimable daily (64 ether)
    /// @dev Chosen as it is both square of 8 and cube of 4 for scoring calculations
    uint256 constant CLAIMABLE_AMOUNT = 64 ether;

    /// @notice Maximum score a user can allocate to a single proposal
    uint256 constant MAX_SCORE_ALLOCATION = 900000;

    /// @notice Storage slot for the diamond storage pattern
    bytes32 private constant URIStorageStorageLocation =
        keccak256(abi.encode(uint256(keccak256("WIP.storage")) - 1)) & ~bytes32(uint256(0xff));

    /**
     * @notice Helper function to access the contract's storage
     * @dev Uses assembly to locate the diamond storage position
     * @return s Reference to the WIPStorage struct
     */
    function getStorage() private pure returns (WIPStorage storage s) {
        bytes32 position = URIStorageStorageLocation;
        assembly {
            s.slot := position
        }
    }

    /**
     * @notice Event emitted when the first citizen of a country is onboarded
     * @param country Name of the country
     * @param onboardingBonus Amount of tokens given as onboarding bonus
     * @param citizen Address of the onboarded citizen
     */
    event FirstCitizenOnboarded(string indexed country, uint256 indexed onboardingBonus, address indexed citizen);

    event GlobalCitizenOnboarded(string indexed country, uint256 indexed onboardingBonus, address indexed citizen);

    /**
     * @notice Event emitted when a passport is verified
     * @param citizen Address of the verified citizen
     * @param isExpired Whether the passport is expired
     */
    event Verified(address citizen, bool isExpired);

    /**
     * @notice Event emitted when a new country DAO is created
     * @param country Hashed identifier of the country
     * @param godFather Address of the first citizen who created the country DAO
     * @param token Address of the country's governance token
     * @param dao Address of the country's DAO contract
     * @param countryName Human-readable name of the country
     */
    event NewCountryOnboarded(
        bytes32 indexed country,
        address indexed godFather,
        address token,
        address dao,
        string countryName
    );

    /**
     * @notice Event emitted when a user votes on proposals
     * @param participant Address of the voter
     * @param day Day number when the vote was cast
     * @param proposal Hash of the proposal being voted on
     * @param country Country of the voter
     * @param proposerCountry Country of the proposal creator
     * @param scoreGiven Amount of voting power allocated
     */
    event VotingByAddress(
        address indexed participant,
        uint256 indexed day,
        bytes32 indexed proposal,
        string country,
        string proposerCountry,
        uint256 scoreGiven
    );

    event ProposalScoreUpdatedByCountry(
        uint256 indexed score,
        uint256 indexed day,
        bytes32 indexed country,
        bytes32 proposal
    );
    event ProposalScoreUpdatedByAddress(
        uint256 indexed score,
        uint256 indexed day,
        address indexed proposer,
        bytes32 proposal
    );

    /**
     * @notice Event for tracking votes by country
     * @param country Hashed identifier of the voter's country
     * @param day Day number when the vote was cast
     * @param proposal Hash of the proposal being voted on
     * @param proposer Address of the proposal creator
     * @param voter Address of the voter
     * @param proposerCountry Country of the proposal creator
     * @param scoreGiven Amount of voting power allocated
     */
    event VotingByCountry(
        bytes32 indexed country,
        uint256 indexed day,
        bytes32 indexed proposal,
        address proposer,
        address voter,
        string proposerCountry,
        uint256 scoreGiven
    );

    /**
     * @notice Event for tracking proposals by country
     * @param country Hashed identifier of the proposer's country
     * @param day Day number when the proposal was created
     * @param proposal Hash of the proposal
     * @param proposalText Full text of the proposal
     * @param countryString Human-readable name of the country
     */
    event ProposingByCountry(
        bytes32 indexed country,
        uint256 indexed day,
        bytes32 indexed proposal,
        string proposalText,
        string countryString,
        uint256 scoreWhenProposed
    );

    /**
     * @notice Event for tracking proposals by address
     * @param proposer Address of the proposal creator
     * @param day Day number when the proposal was created
     * @param proposal Hash of the proposal
     * @param proposalText Full text of the proposal
     */
    event ProposingByAddress(
        address indexed proposer,
        uint256 indexed day,
        bytes32 indexed proposal,
        string proposalText,
        uint256 scoreWhenProposed
    );

    /**
     * @notice Get the current day number based on timestamp
     * @dev Used for daily token claiming and proposal tracking
     * @return uint256 Current day number (timestamp / 1 day)
     */
    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    /**
     * @notice Constructor
     * @dev Intentionally empty as initialization happens in initialize()
     */
    constructor() {
        // _disableInitializers();
    }

    bytes32 constant UNHash = bytes32(0x0123456789ABCDFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF);

    /**
     * @notice Initializes the WIP contract
     * @dev Sets up the contract with required dependencies and initializes the base contracts
     * @param verifier Address of the passport verification contract
     * @param _daoDistribution Address of the DAO distribution contract
     * @param _worldMultiSig Address of the WorldMultiSig contract
     * @param initialOperator Address with initial control of the WorldMultiSig
     */
    function initialize(
        address verifier,
        address _daoDistribution,
        address _worldMultiSig,
        address initialOperator
    ) public initializer {
        __ERC20_init("WIP", "WIP");
        __ReentrancyGuard_init();
        require(verifier != address(0), "Verifier is required");
        require(_daoDistribution != address(0), "DAO distribution is required");
        require(_worldMultiSig != address(0), "WorldMultiSig is required");
        require(initialOperator != address(0), "Initial operator is required");
        __Pausable_init();

        InstantiationData memory instantiationData = InstantiationData({
            issuingState: UNHash,
            stateName: "United Nations DAO",
            stateShortName: "UN DAO",
            godFather: tx.origin
        });
        bytes memory data = abi.encode(instantiationData);
        WIPStorage storage s = getStorage();
        s.daoDistribution = IDistribution(_daoDistribution);
        s.verifier = Verifier(verifier);
        s.worldMultiSig = WorldMultiSigV1(payable(address(_worldMultiSig)));
        s.lastProposalDay = currentDay() - 1;
        (address[] memory instances, , ) = s.daoDistribution.instantiate(data);
        s.daos[UNHash] = DAO(GovernanceToken(instances[0]), instances[1], 1337000 ether, 1);
        WorldMultiSigV1(payable(address(_worldMultiSig))).initializeByWIP(initialOperator);
        require(s.worldMultiSig.getWIP() == address(this), "WorldMultiSig is not controlled by the WIP");
        emit NewCountryOnboarded(UNHash, tx.origin, instances[0], instances[1], "United Nations");
    }

    /**
     * @notice Verifies a citizen's passport and registers them in the system
     * @dev Uses zero-knowledge proofs for privacy-preserving verification
     * @param proof The zero-knowledge proof of passport validity
     * @custom:security Requires valid proof and non-expired passport
     */
    function verifySelfProof(
        IVcAndDiscloseCircuitVerifier.VcAndDiscloseProof memory proof
    ) public nonReentrant whenNotPaused {
        WIPStorage storage s = getStorage();
        (
            ReadableRevealedData memory revealedData,
            uint256 expiresAt,
            bool isExpired,
            string memory issuingState,
            address citizen
        ) = Verifier(s.verifier).verifySelfProofAndReturn(proof);
        emit Verified(citizen, isExpired);

        s.lastClaimed[citizen] = currentDay() - 1;

        if (!isExpired) {
            bytes32 issuingStateHash = keccak256(bytes(revealedData.issuingState));
            if (address(s.daos[issuingStateHash].token) == address(0)) {
                InstantiationData memory instantiationData = InstantiationData({
                    issuingState: issuingStateHash,
                    stateName: string.concat(revealedData.issuingState, " DAO"),
                    stateShortName: string.concat(revealedData.issuingState),
                    godFather: citizen
                });
                bytes memory data = abi.encode(instantiationData);
                (address[] memory instances, , ) = s.daoDistribution.instantiate(data);
                s.daos[issuingStateHash] = DAO(GovernanceToken(instances[0]), instances[1], 1337000 ether, 1);
                emit NewCountryOnboarded(
                    issuingStateHash,
                    citizen,
                    instances[0],
                    instances[1],
                    revealedData.issuingState
                );
            } else {
                uint256 onboardingCountryDrop = s.daos[issuingStateHash].bonusBase /
                    s.daos[issuingStateHash].verifiedCount;
                if (onboardingCountryDrop > 1) {
                    GovernanceToken(s.daos[issuingStateHash].token).mint(citizen, onboardingCountryDrop);
                    emit FirstCitizenOnboarded(issuingState, onboardingCountryDrop, citizen);
                }
                s.daos[issuingStateHash].verifiedCount++;
            }
            uint256 UNOnboardingDrop = s.daos[UNHash].bonusBase / s.daos[UNHash].verifiedCount;
            if (UNOnboardingDrop > 1) {
                GovernanceToken(s.daos[UNHash].token).mint(citizen, UNOnboardingDrop);
                emit GlobalCitizenOnboarded("United Nations", UNOnboardingDrop, citizen);
            }
            s.daos[UNHash].verifiedCount++;

            s.passportHolders[citizen] = PassportHolder({
                citizenship: revealedData.issuingState,
                revalidateAt: expiresAt,
                isQualified: true
            });
        } else {
            revert("Not eligible: Expired");
        }
    }

    /**
     * @notice Pauses all contract functions with the whenNotPaused modifier
     * @dev Can only be called by the WorldMultiSig contract
     */
    function pause() public {
        WIPStorage storage s = getStorage();
        require(msg.sender == address(s.worldMultiSig), "only wolrdMultiSig");
        _pause();
    }

    /**
     * @notice Unpauses contract functions
     * @dev Can only be called by the WorldMultiSig contract
     */
    function unpause() public {
        WIPStorage storage s = getStorage();
        require(msg.sender == address(s.worldMultiSig), "only wolrdMultiSig");
        _unpause();
    }

    /**
     * @notice Main function for claiming daily tokens, submitting proposals, and voting
     * @dev Handles multiple operations: token claiming, proposal submission, and voting on previous proposals
     * @param proposals Array of proposal texts being submitted
     * @param votes Array of VoteElement arrays for voting on previous proposals
     * @param accounts Array of addresses to claim/propose/vote on behalf of (if authorized)
     * @custom:security Uses quadratic voting for same-country proposals and cubic voting for cross-country proposals
     */
    function claimBatch(string[] memory proposals, VoteElement[][] memory votes, address[] memory accounts) public {
        require(proposals.length == votes.length, "array lengths inconsistent");
        require(proposals.length == accounts.length, "array lengths inconsistent");
        for (uint256 i = 0; i < proposals.length; i++) {
            claim(proposals[i], votes[i], accounts[i]);
        }
    }

    /**
     * @notice Main function for claiming daily tokens, submitting proposals, and voting
     * @dev Handles multiple operations: token claiming, proposal submission, and voting on previous proposals
     * @param newProposal Text of the new proposal being submitted
     * @param vote Array of VoteElement structs for voting on previous proposals
     * @param onBehalfOf Address to claim/propose/vote on behalf of (if authorized)
     * @custom:security Uses quadratic voting for same-country proposals and cubic voting for cross-country proposals
     */
    function claim(
        string memory newProposal,
        VoteElement[] memory vote,
        address onBehalfOf
    ) public nonReentrant whenNotPaused {
        WIPStorage storage s = getStorage();
        {
            require(bytes(newProposal).length > 0, "Empty proposal");
            require(bytes(newProposal).length <= 1337, "Your idea is too transcendental, use IPFS link");
            require(s.passportHolders[onBehalfOf].isQualified, "Not eligible: Not a DAO citizen");
            require(s.passportHolders[onBehalfOf].revalidateAt > block.timestamp, "Not eligible: Expired");
        }

        uint256 day = currentDay();
        uint256 proposalCntYesterday = s.daily[day - 1].proposalCnt;
        uint256 balance = balanceOf(onBehalfOf);
        uint256 spent = 0;
        string memory citizenship = s.passportHolders[onBehalfOf].citizenship;
        bytes32 citizenshipHash = keccak256(bytes(citizenship));
        {
            if (address(s.daos[citizenshipHash].token) == address(0)) {
                revert("Not eligible: Not a DAO citizen");
            }
        }
        uint256 daysNotClaimed = day - s.lastClaimed[onBehalfOf];
        require(daysNotClaimed > 0, "Already claimed");
        s.lastClaimed[onBehalfOf] = day;
        if (proposalCntYesterday > 1 || (proposalCntYesterday > 0 && daysNotClaimed > 1)) {
            if (balance > 0) {
                require(vote.length > 0, "No vote");
                // Require voting
                for (uint256 i = 0; i < vote.length; i++) {
                    VoteElement memory voteElement = vote[i];
                    {
                        bool proposalExists = s.daily[day - 1].proposals[voteElement.proposal].exists;
                        require(proposalExists, "Proposal is not in daily menu :(");
                    }
                    require(voteElement.scoresGiven <= MAX_SCORE_ALLOCATION, "Score allocation exceeds maximum");
                    address proposer = s.daily[day - 1].proposals[voteElement.proposal].proposer;
                    require(proposer != onBehalfOf, "You cannot vote for yourself");
                    string memory proposerCitizenship = s.passportHolders[proposer].citizenship;
                    {
                        bytes32 proposerCountry = keccak256(bytes(proposerCitizenship));
                        uint256 value = 0;
                        if (citizenshipHash == proposerCountry) {
                            value += voteElement.scoresGiven * voteElement.scoresGiven;
                        } else {
                            require(
                                voteElement.scoresGiven > 3,
                                "Cross-country votes require committing at least 4 points"
                            );
                            value += voteElement.scoresGiven * voteElement.scoresGiven * voteElement.scoresGiven;
                        }
                        spent += value;
                        require(spent * 1 ether <= balance, "Not enough balance");
                        s.proposalScores[voteElement.proposal] += value;
                        emit ProposalScoreUpdatedByCountry(value, day, citizenshipHash, voteElement.proposal);
                        emit ProposalScoreUpdatedByAddress(value, day, proposer, voteElement.proposal);
                        {
                            uint256 decimals = GovernanceToken(s.daos[proposerCountry].token).decimals();
                            GovernanceToken(s.daos[proposerCountry].token).mint(
                                proposer,
                                voteElement.scoresGiven * 10 ** decimals
                            );
                        }
                        {
                            uint256 decimals = GovernanceToken(s.daos[UNHash].token).decimals();
                            GovernanceToken(s.daos[UNHash].token).mint(
                                proposer,
                                (voteElement.scoresGiven * 10 ** decimals * s.daos[proposerCountry].verifiedCount) /
                                    s.daos[UNHash].verifiedCount
                            );
                        }
                    }
                    {
                        emit VotingByAddress(
                            onBehalfOf,
                            day,
                            voteElement.proposal,
                            citizenship,
                            proposerCitizenship,
                            voteElement.scoresGiven
                        );
                        emit VotingByCountry(
                            citizenshipHash,
                            day,
                            voteElement.proposal,
                            onBehalfOf,
                            proposer,
                            proposerCitizenship,
                            voteElement.scoresGiven
                        );
                    }
                }
                require((spent * 1 ether) > CLAIMABLE_AMOUNT / 2, "you must spend at least half of your daily balance");
            }
        } else {
            uint256 daysWithoutProposal = day - s.lastProposalDay;
            if (daysWithoutProposal > 1) {
                uint256 bonus = getNoProposalBonus(day) * CLAIMABLE_AMOUNT;
                GovernanceToken(s.daos[citizenshipHash].token).mint(onBehalfOf, bonus);
            }
        }
        s.lastProposalDay = day;
        // return;
        bytes32 newProposalHash = keccak256(bytes(newProposal));
        require(!s.daily[day].proposals[newProposalHash].exists, "Proposal already exists");
        s.daily[day].proposals[newProposalHash] = DailyProposal({
            proposal: newProposalHash,
            score: 0,
            proposer: onBehalfOf,
            exists: true
        });
        s.daily[day].proposalCnt++;
        bool isAuthorized = msg.sender == onBehalfOf ||
            (allowance(onBehalfOf, msg.sender) > CLAIMABLE_AMOUNT &&
                allowance(onBehalfOf, msg.sender) >= spent * 1 ether);
        require(isAuthorized, "Not authorized");
        if (msg.sender != onBehalfOf) {
            uint256 allowance = allowance(msg.sender, onBehalfOf);
            require(allowance >= spent * 1 ether, "Not authorized");
            _approve(msg.sender, onBehalfOf, allowance - spent * 1 ether);
        }
        _burn(onBehalfOf, spent * 1 ether);
        // This is done to enshrine active voting, if you want to disappear for a while, you can do it
        // but it's not worth to try sniping a good day.
        uint256 accumulatedCoins = daysNotClaimed > 7 ? daysNotClaimed * CLAIMABLE_AMOUNT : 0;
        _mint(onBehalfOf, CLAIMABLE_AMOUNT + accumulatedCoins);
        uint256 scoreWhenProposed = s.proposalScores[newProposalHash];
        emit ProposingByAddress(onBehalfOf, day, newProposalHash, newProposal, scoreWhenProposed);
        emit ProposingByCountry(citizenshipHash, day, newProposalHash, newProposal, citizenship, scoreWhenProposed);
    }

    /**
     * @notice Calculates bonus tokens for days without proposals
     * @dev Rewards users who claim after days with no proposals
     * @param day The day to calculate the bonus for
     * @return uint256 The bonus multiplier (days without proposals squared)
     */
    function getNoProposalBonus(uint256 day) public view returns (uint256) {
        WIPStorage storage s = getStorage();
        uint256 daysWithoutProposal = day - s.lastProposalDay;
        if (daysWithoutProposal > 2) {
            return (daysWithoutProposal * daysWithoutProposal);
        }
        return 0;
    }

    /**
     * @notice Gets the number of proposals for a specific day
     * @param day The day number to query
     * @return uint256 Number of proposals submitted on that day
     */
    function getDayProposalCnt(uint256 day) public view returns (uint256) {
        WIPStorage storage s = getStorage();
        return s.daily[day].proposalCnt;
    }

    /**
     * @notice Gets the number of proposals from yesterday
     * @return uint256 Number of proposals submitted yesterday
     */
    function getYesterdayProposalCnt() public view returns (uint256) {
        WIPStorage storage s = getStorage();
        return s.daily[currentDay() - 1].proposalCnt;
    }

    /**
     * @notice Checks if an account has already claimed tokens today
     * @param account The address to check
     * @return bool True if the account has claimed today
     */
    function votedToday(address account) public view returns (bool) {
        WIPStorage storage s = getStorage();
        return s.lastClaimed[account] == currentDay();
    }

    /**
     * @notice Event emitted when a user changes their wallet address
     * @param oldWallet The previous wallet address
     * @param newWallet The new wallet address
     */
    event WalletChanged(address indexed oldWallet, address indexed newWallet);

    /**
     * @notice Allows a citizen to transfer their passport to a new wallet
     * @dev Moves citizenship data from the caller to the new wallet address
     * @param newWallet Address of the new wallet
     * @custom:security Can only be called by a qualified passport holder who hasn't claimed today
     */
    function changeWallet(address newWallet) external nonReentrant whenNotPaused {
        WIPStorage storage s = getStorage();
        require(s.passportHolders[msg.sender].isQualified, "only passport holder");
        uint256 day = currentDay();
        uint256 daysNotClaimed = day - s.lastClaimed[msg.sender];
        require(daysNotClaimed > 0, "can change wallet only before claiming");

        s.passportHolders[newWallet] = PassportHolder({
            citizenship: s.passportHolders[msg.sender].citizenship,
            revalidateAt: s.passportHolders[msg.sender].revalidateAt,
            isQualified: s.passportHolders[msg.sender].isQualified
        });

        delete s.passportHolders[msg.sender].citizenship;
        delete s.passportHolders[msg.sender].revalidateAt;
        delete s.passportHolders[msg.sender].isQualified;

        emit WalletChanged(msg.sender, newWallet);
    }
}
