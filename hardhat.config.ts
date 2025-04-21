import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
require("dotenv").config();
import "@nomicfoundation/hardhat-ignition-ethers";
import 'hardhat-deploy';

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 20000,
      },
      metadata: {
        bytecodeHash: "none",
      },
      viaIR: true,
    },
  },
  namedAccounts: {
    deployer: {
      default: "0xF52E5dF676f51E410c456CC34360cA6F27959420",
      celo: "0x6Cf8d74C7875de8C2FfB09228F4bf2A21b25e583",
      celoAlfajores: "0x6Cf8d74C7875de8C2FfB09228F4bf2A21b25e583",
    },

  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
        accounts: {
            mnemonic: "casual vacant letter raw trend tool vacant opera buzz jaguar bridge myself",
            count: 150,
        },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: "casual vacant letter raw trend tool vacant opera buzz jaguar bridge myself",
        count: 150,
      },
    },
    celo: {
      chainId: 42220,
      url: "https://forno.celo.org",
      accounts: [process.env.CELO_KEY as string],
      verify: {
        etherscan: {
          apiKey: process.env.CELOSCAN_API_KEY as string,
          apiUrl: 'https://api.celoscan.io',
        },
      },
    },
    celoAlfajores: {
      chainId: 44787,
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: [process.env.CELO_KEY as string],
      verify: {
        etherscan: {
          apiKey: process.env.CELOSCAN_API_KEY as string,
          apiUrl: 'https://alfajores.celoscan.io/',
        },
      },
    },
  },
  etherscan: {
    apiKey: {
      celo: process.env.CELOSCAN_API_KEY as string,
    },
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io",
          browserURL: "https://celoscan.io"
        }
      }
    ]
  }
};
export default config;
