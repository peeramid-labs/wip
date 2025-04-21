import { ethers } from "hardhat";
import { hashEndpointWithScope } from "@selfxyz/core";
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import { MultiSig__factory, WorldMultiSigV1__factory } from "../typechain-types";

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
  const dSigner = await ethers.getSigner(deployer);
  const WorldMultiSigDeployment = await deployments.deploy('WorldMultiSigV1', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [false],
    proxy: {
      proxyContract: 'TransparentUpgradeableProxy',
      execute: {
        methodName: 'initialize',
        args: [deployer],
      },
    },

  });

  const WIPDeployment = await deployments.deploy('WIP', {
    from: deployer,
    skipIfAlreadyDeployed: true,
    args: [false],
    proxy: {
    proxyContract: 'TransparentUpgradeableProxy',
      execute: {
        methodName: 'initialize',
        args: [VerifierDeployment.address, DAODistributionDeployment.address, WorldMultiSigDeployment.address],
      },
    },
  });

  const proxyAbi = [
    "function transferOwnership(address newOwner) public",
    "function renounceOwnership() public",
    "function owner() public view returns (address)",
    "function getAdmin() public view returns (address)",
  ];
  // Transfer upgrade rights of WIP to WorldMultiSig
//   const wipContract = new ethers.Contract(WIPDeployment.address, proxyAbi, dSigner);
//   const adminBytes = await ethers.provider.getStorage(await wipContract.getAddress(), "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103");
//   const adminAddress = ethers.getAddress("0x" + adminBytes.slice(26));
//   console.log("adminAddress", adminAddress);

//   const adminContract = new ethers.Contract(adminAddress, proxyAbi, dSigner);
//   await adminContract.transferOwnership(WorldMultiSigDeployment.address);
//   console.log("proxyContract ownership transferred", await adminContract.owner());

//   // Transfer upgrade rights of WorldMultiSig to WorldMultiSig Itself
//   const multiSigContract = new ethers.Contract(WorldMultiSigDeployment.address, proxyAbi, dSigner);
//   const multiSigAdminBytes = await ethers.provider.getStorage(WorldMultiSigDeployment.address, "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103");
//   console.log("multiSigAdminBytes", multiSigAdminBytes);
//   const multiSigAdminAddress = ethers.getAddress("0x" + multiSigAdminBytes.slice(26));
//   const multiSigProxyAdmin = new ethers.Contract(multiSigAdminAddress, proxyAbi, dSigner);
//   await multiSigProxyAdmin.transferOwnership(await multiSigContract.getAddress());
//   console.log("multiSigProxyAdmin ownership transferred", await multiSigProxyAdmin.owner());
  const multiSigContractImpl = WorldMultiSigV1__factory.connect(WorldMultiSigDeployment.address, dSigner);
  await multiSigContractImpl.setWIP(WIPDeployment.address);


  console.log("WorldMultiSig deployed to:",  WorldMultiSigDeployment.address);
  console.log("WIP deployed to:", WIPDeployment.address);
  const verify = await new ethers.Contract(WIPDeployment.address, WIPDeployment.abi, dSigner)['worldMultiSig()']();
  console.log("verify", verify);

}

export default func;
func.tags = ['wip'];
