const fs = require('fs')
const path = require('path')
const ethers = require('ethers')
const Web3 = require('web3')
const ipToInt = require('ip-to-int')

const web3 = new Web3(new Web3.providers.HttpProvider(`https://ropsten.infura.io/v3/foobar`))

let tknDefinition = require('../../artifacts/ethcontracts/TierionNetworkToken.json')
let regDefinition = require('../../artifacts/ethcontracts/ChainpointRegistry.json')

const TierionNetworkTokenABI = tknDefinition.abi
const ChainpointRegistryABI = regDefinition.abi
const tokenAddress = tknDefinition.networks['3'].address
const registryAddress = regDefinition.networks['3'].address
const chainId = 3
const privateKey = fs.readFileSync(path.resolve('/run/secrets/NODE_ETH_PRIVATE_KEY'), 'utf8')

const wallet = new ethers.Wallet(privateKey)
const tokenContract = web3.eth.Contract(TierionNetworkTokenABI, tokenAddress)
const registryContract = web3.eth.Contract(ChainpointRegistryABI, registryAddress)

async function approve(txData) {
  const funcSigEncoded = tokenContract.methods.approve(registryAddress, 500000000000).encodeABI()

  const tx = {
    gasPrice: txData.gasPrice,
    gasLimit: 185000,
    data: funcSigEncoded,
    to: tokenAddress,
    nonce: txData.nonce,
    chainId: parseInt(chainId, 10)
  }

  return wallet.sign(tx)
}

async function register([txData, registrationParams]) {
  const funcSigEncoded = registryContract.methods
    .stake(ipToInt(registrationParams.NODE_PUBLIC_IP_ADDRESS).toInt(), registrationParams.NODE_ETH_REWARDS_ADDRESS)
    .encodeABI()

  const tx = {
    gasPrice: txData.gasPrice,
    gasLimit: 185000,
    data: funcSigEncoded,
    to: registryAddress,
    nonce: txData.nonce,
    chainId: parseInt(chainId, 10)
  }

  return wallet.sign(tx)
}

module.exports.register = register
module.exports.approve = approve
