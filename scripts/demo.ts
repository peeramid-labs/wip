import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { WIP } from "../typechain-types";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Define the VoteElement interface to match the contract's requirements
interface VoteElement {
  proposal: string;
  scoresGiven: number;
}

const SECONDS_PER_DAY = 86400;
const NUM_DAYS = 3;
// Reducing the number of countries to make the script work with fewer accounts
const COUNTRIES = ["TW", "USA"];
const USERS_PER_COUNTRY = 8;
const MAX_VOTE_SCORE = 8;
const MAX_VOTE_SCORE_CROSS_COUNTRY = 4;

// Helper function to sleep
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Gemini Integration Start ---
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.error("Error: GEMINI_API_KEY environment variable is not set.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

async function callGeminiWithRetry(prompt: string): Promise<string> {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      retries++;
      if (retries >= MAX_RETRIES) {
        console.error(`Gemini API call failed after ${MAX_RETRIES} attempts:`, error);
        throw error; // Rethrow the error after max retries
      }
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retries - 1);
      console.warn(`Gemini API call failed (attempt ${retries}/${MAX_RETRIES}). Retrying in ${delay}ms...`, error.message);
      await sleep(delay);
    }
  }
  // This line should theoretically not be reached, but typescript needs a return path
  throw new Error("Exhausted retries for Gemini API call");
}

async function generateProposalWithGemini(country: string, day: number, userIndex: number): Promise<string> {
  const prompt = `You are simulating a citizen from ${country} in a global governance simulation on day ${day + 1}.
  Generate a concise (max 50 words), impactful, and unique proposal relevant to global issues or the specific country.
  Avoid generic topics. Make it sound like a real proposal someone might submit.
  Examples:
  - Fund local solar panel installation programs.
  - Develop blockchain-based supply chain tracking.
  - Create multilingual mental health support chatbots for diverse communities.

  Proposal for Citizen ${userIndex} from ${country} on Day ${day + 1}:`;

  try {
    const textResult = await callGeminiWithRetry(prompt);
    const text = textResult.trim().slice(0, 400); // Ensure max length
    console.log(`Generated proposal via Gemini for ${country} citizen ${userIndex}: ${text.substring(0, 50)}...`);
    return text || `Default proposal for ${country} citizen ${userIndex} on day ${day + 1}`; // Fallback
  } catch (error) {
    console.error(`Error generating proposal with Gemini for ${country} citizen ${userIndex} (after retries):`, error);
    // Fallback to a simple proposal if Gemini fails
    return `Fallback proposal for ${country} citizen ${userIndex} on day ${day + 1} due to API error.`;
  }
}
// --- Gemini Integration End ---

// --- Gemini Vote Generation Start ---
async function generateVotesWithGemini(
  user: HardhatEthersSigner,
  country: string,
  day: number,
  proposalsToVoteOn: { proposalHash: string, proposerCountry: string }[],
  contract: WIP
): Promise<VoteElement[]> {
  const userAddress = user.address;
  const userCountryHash = ethers.keccak256(ethers.toUtf8Bytes(country));

  // Prepare proposal details for the prompt
  const proposalDetails = proposalsToVoteOn.map((p, i) => {
    const isSameCountry = p.proposerCountry === userCountryHash;
    const maxScore = isSameCountry ? MAX_VOTE_SCORE : MAX_VOTE_SCORE_CROSS_COUNTRY;
    return `  ${i}: Proposal Hash: ${p.proposalHash.substring(0, 10)}... (Proposer Country Same: ${isSameCountry}, Max Score: ${maxScore})`;
  }).join("\n");

  const prompt = `You are simulating citizen ${userAddress.substring(0, 8)} from ${country} on Day ${day + 1}.
Your task is to vote on proposals from Day ${day}.
You have 64 voting credits for today.
You MUST spend at least 32 credits.

Voting Rules:
- Same country votes: cost = score^2 (max score ${MAX_VOTE_SCORE})
- Cross country votes: cost = score^3 (max score ${MAX_VOTE_SCORE_CROSS_COUNTRY})

Available Proposals (Index: Hash... (Same Country, Max Score)):
${proposalDetails}

Decide which proposals to vote on (by index) and the score (1 to max score) for each.
Calculate the cost for each vote and the total cost.
Ensure the total cost is between 32 and 64 (inclusive).

Output ONLY a valid JSON array of your chosen votes in the following format:
[{"proposalIndex": number, "score": number}, ...]

Example Output:
[{"proposalIndex": 2, "score": 5}, {"proposalIndex": 0, "score": 3}]

Your JSON response:`;

  let votes: VoteElement[] = [];
  let totalCreditsSpent = 0;

  try {
    console.log(`Requesting votes from Gemini for ${userAddress} (${country}) on Day ${day + 1}...`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Clean potential markdown code block fences
    if (text.startsWith("```json")) {
        text = text.substring(7);
    }
    if (text.endsWith("```")) {
        text = text.substring(0, text.length - 3);
    }
    text = text.trim(); // Trim again after removing fences

    console.log(`Gemini response for votes:
${text}`);

    const geminiVotes: { proposalIndex: number, score: number }[] = JSON.parse(text);

    // Validate Gemini's votes
    for (const vote of geminiVotes) {
      if (vote.proposalIndex < 0 || vote.proposalIndex >= proposalsToVoteOn.length) {
        throw new Error(`Invalid proposal index: ${vote.proposalIndex}`);
      }
      const proposal = proposalsToVoteOn[vote.proposalIndex];
      const isSameCountry = proposal.proposerCountry === userCountryHash;
      const maxScore = isSameCountry ? MAX_VOTE_SCORE : MAX_VOTE_SCORE_CROSS_COUNTRY;
      const score = vote.score;

      if (score < 1 || score > maxScore) {
        throw new Error(`Invalid score ${score} for proposal ${vote.proposalIndex} (max: ${maxScore})`);
      }

      const cost = isSameCountry ? score * score : score * score * score;

      // Check if this vote would exceed the 64 credit limit
      if (totalCreditsSpent + cost > 64) {
          console.warn(`Gemini suggested vote (Proposal ${vote.proposalIndex}, Score ${score}) exceeds 64 credit limit. Skipping this vote.`);
          continue; // Skip this vote
      }

      // Check for duplicate votes (Gemini might suggest voting on the same proposal multiple times)
      if (votes.some(v => v.proposal === proposal.proposalHash)) {
        console.warn(`Gemini suggested duplicate vote for proposal ${vote.proposalIndex}. Skipping.`);
        continue;
      }

      votes.push({
        proposal: proposal.proposalHash,
        scoresGiven: score
      });
      totalCreditsSpent += cost;
    }

    if (totalCreditsSpent < 32) {
      throw new Error(`Gemini votes total cost (${totalCreditsSpent}) is less than the required 32.`);
    }

    console.log(`Successfully generated ${votes.length} votes via Gemini, total cost: ${totalCreditsSpent}`);

  } catch (error: any) {
    console.warn(`Error processing Gemini votes for ${userAddress}: ${error.message}. Falling back to random voting.`);
    // Fallback to original random voting logic if Gemini fails or provides invalid votes
    votes = [];
    totalCreditsSpent = 0;
    const shuffledProposals = [...proposalsToVoteOn].sort(() => 0.5 - Math.random());

    for (const proposal of shuffledProposals) {
        if (totalCreditsSpent >= 32) break; // Stop if we've met the minimum requirement

        const isSameCountry = proposal.proposerCountry === userCountryHash;
        const maxScore = isSameCountry ? MAX_VOTE_SCORE : MAX_VOTE_SCORE_CROSS_COUNTRY;

        // Try voting with max score first
        let score = maxScore;
        let cost = isSameCountry ? score * score : score * score * score;

        // If max score is too expensive, try lower scores
        while (score > 0 && totalCreditsSpent + cost > 64) {
            score--;
            if (score > 0) {
                cost = isSameCountry ? score * score : score * score * score;
            }
        }

        // If even score 1 is too much, or we can't afford anything more, stop
        if (score === 0 || totalCreditsSpent + cost > 64) {
            continue; // Move to the next proposal if this one can't be afforded
        }

        // Add the vote if it's valid and affordable
         if (!votes.some(v => v.proposal === proposal.proposalHash)) { // Ensure no duplicates in fallback
            votes.push({
                proposal: proposal.proposalHash,
                scoresGiven: score
            });
            totalCreditsSpent += cost;
        }
    }
     // If after trying random votes, we still haven't spent 32, log a warning.
     // This might happen if there are very few proposals or they are all very expensive cross-country ones.
     if (totalCreditsSpent < 32) {
         console.warn(`Fallback voting for ${userAddress} resulted in only ${totalCreditsSpent} credits spent (less than 32). Submitting anyway.`);
     }
    console.log(`Fallback: Generated ${votes.length} random votes, total cost: ${totalCreditsSpent}`);
  }

  return votes;
}
// --- Gemini Vote Generation End ---

async function main() {
  // Get the contract address from environment variable
  let contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("Error: CONTRACT_ADDRESS environment variable is not set");
    console.error("Please set the CONTRACT_ADDRESS environment variable or use the run-test-demo.sh script");
    process.exit(1);
  }

  console.log(`Using contract address: ${contractAddress}`);

  // Get signers
  const allSigners = await ethers.getSigners();
  console.log(`Got ${allSigners.length} signers from Hardhat`);

  // Check if we have enough signers
  const requiredSigners = COUNTRIES.length * USERS_PER_COUNTRY;
  if (allSigners.length < requiredSigners) {
    console.error(`Not enough signers available. Got ${allSigners.length}, need at least ${requiredSigners}.`);
    console.error('Please update hardhat.config.ts to increase the number of accounts or reduce the number of countries/users.');
    process.exit(1);
  }

  // Connect to the contract
  const contract = await ethers.getContractAt("WIP", contractAddress) as WIP;

  // Organize users by country
  const usersByCountry: { [country: string]: HardhatEthersSigner[] } = {};
  let signerIndex = 0;

  for (const country of COUNTRIES) {
    usersByCountry[country] = [];
    for (let i = 0; i < USERS_PER_COUNTRY; i++) {
      usersByCountry[country].push(allSigners[signerIndex]);
      signerIndex++;
    }
  }

  // Check contract state before starting
  console.log("\nChecking contract state before starting...");
  try {
    const distributionAddress = await contract.daoDistribution();
    console.log(`DAO Distribution address: ${distributionAddress}`);

    // Check current day
    const currentDay = await contract.currentDay();
    console.log(`Current day on contract: ${currentDay}`);
  } catch (error: any) {
    console.error(`Error checking contract state: ${error.message}`);
  }

  // Register all users with their countries using verifySelfDemo
  console.log("\nRegistering users with their countries...");
  for (const country of COUNTRIES) {
    console.log(`\nRegistering users for country: ${country}`);

    // Register the first user and check if the DAO is created
    const firstUser = usersByCountry[country][0];
    console.log(`Registering first user ${firstUser.address} for ${country}`);

    try {
      // Ensure the transaction is mined before proceeding
      const tx = await contract.connect(firstUser).verifySelfDemo(country);
      console.log(`Transaction hash: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`Transaction confirmed, status: ${receipt?.status}`);

      // Check if the user is qualified after registration
      const passport = await contract.passportHolders(firstUser.address);
      console.log(`First user ${firstUser.address}: citizenship=${passport.citizenship}, qualified=${passport.isQualified}`);

      // Check if DAO was created
      const countryHash = ethers.keccak256(ethers.toUtf8Bytes(country));
      const dao = await contract.daos(countryHash);
      console.log(`DAO for ${country} (${countryHash}): token=${dao.token}, dao=${dao.dao}`);

      if (dao.token === "0x0000000000000000000000000000000000000000") {
        console.error(`DAO for ${country} was not created correctly!`);
      }
    } catch (error: any) {
      console.error(`Error registering first user for ${country}: ${error.message}`);
      if (error.error) {
        console.error("Error details:", error.error);
      }
    }

    // Register the rest of the users
    for (let i = 1; i < usersByCountry[country].length; i++) {
      const user = usersByCountry[country][i];
      console.log(`Registering user ${i+1}/${usersByCountry[country].length}: ${user.address}`);
      try {
        const tx = await contract.connect(user).verifySelfDemo(country);
        const receipt = await tx.wait();
        console.log(`Registered user ${user.address} as a citizen of ${country}, tx status: ${receipt?.status}`);

        // Add a small delay to avoid transaction collisions
        await sleep(50);
      } catch (error: any) {
        console.error(`Error registering user ${user.address}: ${error.message}`);
        if (error.error) {
          console.error("Error details:", error.error);
        }
      }
    }
  }

  // Verify the registration was successful
  console.log("\nVerifying user registrations...");
  let allUsersQualified = true;
  for (const country of COUNTRIES) {
    console.log(`\nVerifying users for country: ${country}`);
    const countryHash = ethers.keccak256(ethers.toUtf8Bytes(country));
    console.log("countryHash", countryHash);
    const dao = await contract.daos(countryHash);
    console.log(`DAO for ${country} (${countryHash}): token=${dao.token}, dao=${dao.dao}`);

    if (dao.token === "0x0000000000000000000000000000000000000000") {
      console.error(`ERROR: DAO for ${country} was not created! Stopping the demo.`);
      process.exit(1);
    }

    for (let i = 0; i < usersByCountry[country].length; i++) {
      const user = usersByCountry[country][i];
      try {
        const passport = await contract.passportHolders(user.address);
        console.log(`User ${user.address}: citizenship=${passport.citizenship}, qualified=${passport.isQualified}, expires=${passport.revalidateAt}`);
        if (!passport.isQualified) {
          console.warn(`WARNING: User ${user.address} is not qualified!`);
          allUsersQualified = false;
        }
      } catch (error: any) {
        console.error(`Error verifying user ${user.address}: ${error.message}`);
        allUsersQualified = false;
      }
    }
  }

  if (!allUsersQualified) {
    console.error("ERROR: Not all users were qualified. Stopping the demo.");
    process.exit(1);
  }

  console.log("\nAll users have been registered and qualified successfully!");

  // Mint initial tokens for first day by advancing time and submitting an initial proposal
  console.log("\nMinting initial tokens for first day...");

  // Making a single proposal for the first day
  for (const country of COUNTRIES) {
    for(const user of usersByCountry[country]) {
      try {
        console.log(`Submitting initial proposal for user ${user.address} from ${country}`);
      const proposal = "Initial setup proposal - " + country + user.address;
      const tx = await contract.connect(user).claim(proposal, []);
      await tx.wait();
      console.log(`Initial proposal submitted for ${user.address}`);
    } catch (error: any) {
        console.error(`Error submitting initial proposal for ${user.address}: ${error.message}`);
      }
    }
  }

  // Advance time to the next day so users have tokens
  console.log("\nAdvancing time by 1 day to issue initial tokens...");
  await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
  await ethers.provider.send("evm_mine", []);

  console.log("\nVerifying token balances after first day...");
  for (const country of COUNTRIES) {
    for (const user of usersByCountry[country]) {
      const balance = await contract.balanceOf(user.address);
      console.log(`User ${user.address} from ${country} has ${balance} tokens today`);
    }
  }

  // Set up our proposals storage - we'll need to track these to vote on them
  let previousDayProposals: { [day: number]: { proposalHash: string, proposerCountry: string }[] } = {};

  // Simulate activity for multiple days
  for (let day = 1; day < NUM_DAYS; day++) {
    console.log(`\n==== Day ${day + 1} ====`);

    // Get the current day from the contract for consistency
    const currentDay = await contract.currentDay();
    console.log(`Current day on contract: ${currentDay}`);

    // Initialize the proposals for this day
    previousDayProposals[Number(currentDay)] = await contract.queryFilter(contract.filters.ProposingByCountry(undefined, BigInt(currentDay-1n), undefined)).then((logs) => {
      return logs.map((log) => {
        return {
          proposalHash: log.args.proposal,
          proposerCountry: log.args.country
        }
      });
    });
    if(previousDayProposals[Number(currentDay)].length === 0) {
      console.log("No proposals submitted for day " + (day));
      throw new Error("No proposals submitted for day " + (day));
    }

    // For each country, have users submit proposals and vote
    for (const country of COUNTRIES) {
      console.log(`\nProcessing country: ${country}`);

      for (const user of usersByCountry[country]) {
        // If it's not the first day, we need to vote on previous day's proposals
        let votes: VoteElement[] = [];

        if (day > 0 && previousDayProposals[Number(currentDay)] && previousDayProposals[Number(currentDay)].length > 0) {
          const proposalsToVoteOn = previousDayProposals[Number(currentDay)];
          console.log(`User ${user.address} needs to vote on ${proposalsToVoteOn.length} proposals from yesterday.`);

          // Generate votes using Gemini (with fallback to random)
          votes = await generateVotesWithGemini(user, country, day, proposalsToVoteOn, contract);

        } else if (day > 0) {
            console.log(`No proposals found from the previous day (${Number(currentDay)}) for user ${user.address} to vote on.`);
        }

        // Create a new proposal for this user using Gemini
        const userIndex = usersByCountry[country].indexOf(user);
        const newProposal = await generateProposalWithGemini(country, day, userIndex);

        // Check citizenship data
        const passport = await contract.passportHolders(user.address);
        console.log(`User ${user.address} citizenship: ${passport.citizenship}, qualified: ${passport.isQualified}`);

        // Check if DAO exists for this country
        const countryHash = ethers.keccak256(ethers.toUtf8Bytes(country));
        console.log("countryHash", countryHash);
        const dao = await contract.daos(countryHash);
        console.log(`DAO for ${country} (${countryHash}): token=${dao.token}, dao=${dao.dao}`);

        // Submit the proposal with votes (if any)
        try {
          console.log(`Submitting proposal for user ${user.address}:`, newProposal);
          console.log(`Votes:`, votes.map(v => ({
            proposal: v.proposal,
            scoresGiven: v.scoresGiven
          })));

          // Convert the votes to the expected format with BigInt values
          const formattedVotes = votes.map(vote => ({
            proposal: vote.proposal,
            scoresGiven: vote.scoresGiven
          }));

          // Call the claim function correctly
          const tx = await contract.connect(user).claim(newProposal, formattedVotes);
          console.log(`Transaction hash: ${tx.hash}`);
          console.log("Waiting for transaction confirmation...");

          const receipt = await tx.wait();
          console.log(`Transaction confirmed, status: ${receipt?.status}`);

          console.log(`User ${user.address} submitted proposal: "${newProposal.substring(0, 30)}..." with ${votes.length} votes`);
        } catch (error: any) {
          console.error(`Failed to submit proposal for user ${user.address}:`, error);
          // Do not throw here, allow the script to continue with the next user
          // throw new Error(error);
          // Try to extract more detailed error information
          if (error.error) {
            console.error(`Error details:`, error.error);
          }
        }

        // Add delay to avoid hitting API rate limits
        await sleep(3000); // 1 second delay after each user's actions
      }
    }

    // If not the last day, increase time to move to next day
    console.log(`\nAdvancing time by 1 day...`);
    await ethers.provider.send("evm_increaseTime", [SECONDS_PER_DAY]);
    await ethers.provider.send("evm_mine", []);
  }

  console.log("\n==== Demo Completed ====");
  console.log(`Created ${NUM_DAYS} days of activity for ${COUNTRIES.length} countries`);
  console.log(`Total proposals submitted: ~${NUM_DAYS * COUNTRIES.length * USERS_PER_COUNTRY}`);
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });