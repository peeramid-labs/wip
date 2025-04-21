// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../WIP.sol";

/**
 * @title MockWIP
 * @dev A mock implementation of WIP for testing purposes
 * This contract exposes functions for directly manipulating the WIP state for testing
 */
contract MockWIP is WIP {
    // We need to redefine the storage location constant from the parent class
    bytes32 private constant URIStorageStorageLocation =
        keccak256(abi.encode(uint256(keccak256("WIP.storage")) - 1)) & ~bytes32(uint256(0xff));

    // We need to redefine this function since we can't access the private one from the parent
    function getWIPStorage() private pure returns (WIPStorage storage s) {
        bytes32 position = URIStorageStorageLocation;
        assembly {
            s.slot := position
        }
    }

    // Direct storage modification methods
    function mockSetCitizenData(
        address citizen,
        string memory citizenship,
        uint256 revalidateAt,
        bool isQualified
    ) external {
        // Get the storage
        WIPStorage storage s = getWIPStorage();

        // Set the passport holder data directly
        s.passportHolders[citizen].citizenship = citizenship;
        s.passportHolders[citizen].revalidateAt = revalidateAt;
        s.passportHolders[citizen].isQualified = isQualified;

        // Mark as claimed the previous day
        uint256 day = currentDay() - 1;
        mockSetLastClaimed(citizen, day);
    }

    function mockSetupDAOForCountry(string memory country, address token, address dao, uint256 bonusBase) external {
        WIPStorage storage s = getWIPStorage();
        bytes32 countryHash = keccak256(bytes(country));

        // Set the DAO data directly
        s.daos[countryHash].token = GovernanceToken(token);
        s.daos[countryHash].dao = dao;
        s.daos[countryHash].bonusBase = bonusBase;
    }

    function mockSetLastClaimed(address account, uint256 day) public {
        WIPStorage storage s = getWIPStorage();
        s.lastClaimed[account] = day;
    }

    // Update lastClaimed to the current day to simulate a user has already claimed
    function mockUpdateLastClaimed(address account) external {
        uint256 day = currentDay();
        mockSetLastClaimed(account, day);
    }

    // Update passport expiry date for testing
    function mockUpdatePassportExpiry(address account, uint256 expiryTimestamp) external {
        WIPStorage storage s = getWIPStorage();
        s.passportHolders[account].revalidateAt = expiryTimestamp;
    }

    function mockSetLastProposalDay(uint256 day) external {
        WIPStorage storage s = getWIPStorage();
        s.lastProposalDay = day;
    }

    function mockAddProposal(string memory proposalText, address proposer) external {
        WIPStorage storage s = getWIPStorage();
        uint256 day = currentDay() - 1;
        bytes32 proposalHash = keccak256(bytes(proposalText));

        // Create a proposal for yesterday
        s.daily[day].proposals[proposalHash].proposal = proposalHash;
        s.daily[day].proposals[proposalHash].score = 0;
        s.daily[day].proposals[proposalHash].proposer = proposer;
        s.daily[day].proposals[proposalHash].exists = true;
        s.daily[day].proposalCnt += 1;
    }

    // Function to add a proposal for the current day (for testing duplicates)
    function mockAddProposalToday(string memory proposalText, address proposer) external {
        WIPStorage storage s = getWIPStorage();
        uint256 day = currentDay(); // Current day
        bytes32 proposalHash = keccak256(bytes(proposalText));

        // Check if the proposal already exists
        require(!s.daily[day].proposals[proposalHash].exists, "Proposal already exists");

        // Create a proposal for today
        s.daily[day].proposals[proposalHash].proposal = proposalHash;
        s.daily[day].proposals[proposalHash].score = 0;
        s.daily[day].proposals[proposalHash].proposer = proposer;
        s.daily[day].proposals[proposalHash].exists = true;
        s.daily[day].proposalCnt += 1;
    }

    // Public function to mint tokens for testing purposes
    function mockMintTokens(address to, uint256 amount) external {
        // Mint tokens directly to the specified address
        _mint(to, amount);
    }

    // Helper function to simulate verification and DAO creation
    function mockVerifySelfProofWithNewCountry(address citizen, string memory countryName, uint256 expiresAt) external {
        WIPStorage storage s = getWIPStorage();

        // Emit the Verified event
        emit Verified(citizen, expiresAt, countryName, false);

        // Update lastClaimed to yesterday
        s.lastClaimed[citizen] = currentDay() - 1;

        // Create new country DAO
        bytes32 countryHash = keccak256(bytes(countryName));

        // Check if DAO already exists for this country
        if (address(s.daos[countryHash].token) == address(0)) {
            // Create instantiation data
            InstantiationData memory instantiationData = InstantiationData({
                issuingState: countryHash,
                stateName: countryName,
                stateShortName: countryName,
                godFather: citizen
            });

            // Get token/dao addresses from distribution
            bytes memory data = abi.encode(instantiationData);
            (address[] memory instances, , ) = s.daoDistribution.instantiate(data);

            // Set up DAO
            s.daos[countryHash] = DAO(GovernanceToken(instances[0]), instances[1], 1337000 ether, 1);

            // Emit event
            emit NewCountryOnboarded(countryHash, citizen, instances[0], instances[1], countryName);
        }

        // Set passport holder data
        s.passportHolders[citizen] = PassportHolder({
            citizenship: countryName,
            revalidateAt: expiresAt,
            isQualified: true
        });
    }

    // Helper function to simulate verification for an existing country
    function mockVerifySelfProofWithExistingCountry(
        address citizen,
        string memory countryName,
        uint256 expiresAt,
        uint256 onboardingBonus
    ) external {
        WIPStorage storage s = getWIPStorage();

        // Emit the Verified event
        emit Verified(citizen, expiresAt, countryName, false);

        // Update lastClaimed to yesterday
        s.lastClaimed[citizen] = currentDay() - 1;

        bytes32 countryHash = keccak256(bytes(countryName));

        // Assume country exists, mint tokens
        if (onboardingBonus > 0) {
            s.daos[countryHash].bonusBase = onboardingBonus * 2; // So we can take half
            uint256 currentValue = s.daos[countryHash].bonusBase;
            uint256 mintAmount = currentValue / 2;
            s.daos[countryHash].bonusBase = currentValue - mintAmount;

            GovernanceToken(s.daos[countryHash].token).mint(citizen, mintAmount);
            emit FirstCitizenOnboarded(countryName, mintAmount, citizen);
        } else {
            GovernanceToken(s.daos[countryHash].token).mint(citizen, 1);
            emit FirstCitizenOnboarded(countryName, 1, citizen);
        }

        // Set passport holder data
        s.passportHolders[citizen] = PassportHolder({
            citizenship: countryName,
            revalidateAt: expiresAt,
            isQualified: true
        });
    }

    // Helper function to create a proposal and vote for it
    function mockAddProposalAndVote(
        string memory proposalText,
        address proposer,
        address voter,
        uint256 score
    ) external {
        WIPStorage storage s = getWIPStorage();

        // First add the proposal
        uint256 day = currentDay() - 1; // Yesterday
        bytes32 proposalHash = keccak256(bytes(proposalText));

        // Create a proposal for yesterday
        s.daily[day].proposals[proposalHash].proposal = proposalHash;
        s.daily[day].proposals[proposalHash].score = 0;
        s.daily[day].proposals[proposalHash].proposer = proposer;
        s.daily[day].proposals[proposalHash].exists = true;
        s.daily[day].proposalCnt += 1;

        if (voter != address(0)) {
            // Add a vote from voter to this proposal
            s.proposalScores[proposalHash] += score;
        }
    }

    function mockSetLastClaimedDay(address account, uint256 day) external {
        mockSetLastClaimed(account, day);
    }

    function mockAddProposalForDay(uint256 day, string memory proposalText, address proposer) external {
        WIPStorage storage s = getWIPStorage();
        bytes32 proposalHash = keccak256(bytes(proposalText));

        // Create a proposal for the specified day
        s.daily[day].proposals[proposalHash].proposal = proposalHash;
        s.daily[day].proposals[proposalHash].score = 0;
        s.daily[day].proposals[proposalHash].proposer = proposer;
        s.daily[day].proposals[proposalHash].exists = true;
        s.daily[day].proposalCnt += 1;
    }

    function mockUpdateUNVerifiedCount(uint256 count) external {
        WIPStorage storage s = getWIPStorage();
        bytes32 UNHash = bytes32(0x0123456789ABCDFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF);
        s.daos[UNHash].verifiedCount = count;
    }

    // Enhanced version of mockVerifySelfProofWithNewCountry that properly updates UN
    function mockVerifySelfProofWithCountryAndUN(
        address citizen,
        string memory countryName,
        uint256 expiresAt
    ) external {
        WIPStorage storage s = getWIPStorage();
        bytes32 UNHash = bytes32(0x0123456789ABCDFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF);

        // Emit the Verified event
        emit Verified(citizen, expiresAt, countryName, false);

        // Update lastClaimed to yesterday
        s.lastClaimed[citizen] = currentDay() - 1;

        // Create new country DAO or use existing one
        bytes32 countryHash = keccak256(bytes(countryName));

        // Check if DAO already exists for this country
        if (address(s.daos[countryHash].token) == address(0)) {
            // Create instantiation data
            InstantiationData memory instantiationData = InstantiationData({
                issuingState: countryHash,
                stateName: countryName,
                stateShortName: countryName,
                godFather: citizen
            });

            // Get token/dao addresses from distribution
            bytes memory data = abi.encode(instantiationData);
            (address[] memory instances, , ) = s.daoDistribution.instantiate(data);

            // Set up DAO
            s.daos[countryHash] = DAO(GovernanceToken(instances[0]), instances[1], 1337000 ether, 1);

            // Emit event
            emit NewCountryOnboarded(countryHash, citizen, instances[0], instances[1], countryName);
        }

        // Set passport holder data
        s.passportHolders[citizen] = PassportHolder({
            citizenship: countryName,
            revalidateAt: expiresAt,
            isQualified: true
        });

        // Update UN data
        uint256 UNOnboardingDrop = s.daos[UNHash].bonusBase / s.daos[UNHash].verifiedCount;
        if (UNOnboardingDrop > 1) {
            GovernanceToken(s.daos[UNHash].token).mint(citizen, UNOnboardingDrop);
            emit GlobalCitizenOnboarded("United Nations", UNOnboardingDrop, citizen);
        }
        s.daos[UNHash].verifiedCount++;
    }
}
