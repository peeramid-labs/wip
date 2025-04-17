import { ethers } from "hardhat";
import { hashEndpointWithScope } from "@selfxyz/core";
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
const { deployments, getNamedAccounts } = hre;
const { deployer } = await getNamedAccounts();



  // For prod environment
  const identityVerificationHub = "0x77117D60eaB7C044e785D68edB6C7E0e134970Ea";
 // Testnet
//  const identityVerificationHub = "0x3e2487a250e2A7b56c7ef5307Fb591Cc8C83623D";

  const scope = hashEndpointWithScope("https://peeramid.network", "Self-WIP-v1");
  const attestationId = 1n;
  const olderThanEnabled = false;
  const olderThan = 18n;
  const forbiddenCountriesEnabled = false;
  const forbiddenCountriesListPacked = [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint];
  const ofacEnabled = [false, false, false] as [boolean, boolean, boolean];

  const GovernanceTokenBaseDeployment = await deployments.deploy('GovernanceToken', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });
  const DAOBaseDeployment = await deployments.deploy('WORLD_DAO', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [

    ],
  });

  const DAODistributionDeployment = await deployments.deploy('DAODistribution', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [
        DAOBaseDeployment.address,
        GovernanceTokenBaseDeployment.address,
        "Self-WIP-1",
        {
          major: 1,
          minor: 0,
          patch: 0,
        }
    ],
  });

  const VerifierDeployment = await deployments.deploy('Verifier', {
    from: deployer,
    skipIfAlreadyDeployed: false,
    args: [identityVerificationHub,
        scope, attestationId, olderThanEnabled, olderThan, forbiddenCountriesEnabled, forbiddenCountriesListPacked, ofacEnabled],
  });

  const WorldMultiSigDeployment = await deployments.deploy('WorldMultiSigV1', {
    from: deployer,
    skipIfAlreadyDeployed: true,

  });



  const WIPDeployment = await deployments.deploy('WIP', {
    from: deployer,
    skipIfAlreadyDeployed: true,
  });

  const WorldDistributionDeployment = await deployments.deploy('WorldDistribution', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [
      DAODistributionDeployment.address,
      VerifierDeployment.address,
      WIPDeployment.address,
      WorldMultiSigDeployment.address,
      "Self-WIP-1",
      {
        major: 1,
        minor: 0,
        patch: 0,
      }
    ]
  });

  console.log("WorldDistribution deployed to:", WorldDistributionDeployment.address);

  const dSigner = await ethers.getSigner(deployer);
  const distr = new ethers.Contract(WorldDistributionDeployment.address,
    WorldDistributionDeployment.abi, dSigner);

 console.log('instantiating...')

  const receipt = await (distr["instantiate(bytes)"]("0x").then(tx => tx.wait()));
  const InstantiateWorldEvent = receipt.logs.find((log: any) => log.topics[0].toLowerCase() == '0x96522718d431f2488e2e2c2abbed5efd4df39981794fc6912ffa13be6046310d'.toLowerCase())
    console.log("InstantiateWorldEvent", InstantiateWorldEvent);
    const worldMultiSig = InstantiateWorldEvent.topics[1];
  const WIP = InstantiateWorldEvent.topics[2];
  console.log("WorldMultiSig deployed to:",  ethers.getAddress( "0x" +worldMultiSig.slice(-40)));
  console.log("WIP deployed to:", ethers.getAddress( "0x" +WIP.slice(-40)));
  const verify = await new ethers.Contract(ethers.getAddress( "0x" +WIP.slice(-40)), WIPDeployment.abi, dSigner)['worldMultiSig()']();
  console.log("verify", verify);

}

export default func;
func.tags = ['wip'];
