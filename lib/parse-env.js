/**
 * Copyright 2019 Tierion
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const envalid = require('envalid')
const ip = require('ip')

function valCoreIPList(list) {
  // If IP list supplied, ensure it is valid, or continue with empty string
  if (list === '') return ''
  let IPs = list.split(',')
  for (let val of IPs) {
    if ((!ip.isV4Format(val) && !ip.isV6Format(val)) || val === '')
      throw new Error('The Core IP list contains an invalid entry')
  }
  // ensure each IP is unique
  let ipSet = new Set(IPs)
  if (ipSet.size !== IPs.length) throw new Error('The Core IP list cannot contain duplicates')
  return IPs
}

function valNetwork(name) {
  if (name === '' || name === 'mainnet') return 'mainnet'
  if (name === 'testnet') return 'testnet'
  throw new Error('The NETWORK value is invalid')
}

const validateCoreIPList = envalid.makeValidator(valCoreIPList)
const validateNetwork = envalid.makeValidator(valNetwork)

let envDefinitions = {
  // Chainpoint Node environment related variables
  NODE_ENV: envalid.str({ default: 'production', desc: 'The type of environment in which the service is running' }),
  NETWORK: validateNetwork({ default: 'mainnet', desc: `The network to use, 'mainnet' or 'testnet'` }),

  LND_SOCKET: envalid.str({ default: 'lnd:10009', desc: 'Lightning GRPC host and port' }),

  PUBLIC_IP: envalid.str({ default: '127.0.0.1', desc: 'IP host and port' }),

  GATEWAY_NAME: envalid.str({ default: 'UNNAMED', desc: 'A, B, or C' }),

  GOOGLE_UA_ID: envalid.str({ default: '', desc: 'Google Universal Analytics ID' }),

  // Chainpoint Core
  CHAINPOINT_CORE_CONNECT_IP_LIST: validateCoreIPList({
    default: '',
    desc: 'A comma separated list of specific Core IPs to connect to (instead of using Core discovery)'
  }),

  AGGREGATION_INTERVAL_SECONDS: envalid.num({
    default: 60,
    desc: `The aggregation and Core submission frequency, in seconds`
  }),

  MAX_SATOSHI_PER_HASH: envalid.num({
    default: 10,
    desc: `The maximum amount you are willing to spend for each hash submission to Core, in Satoshi`
  }),

  PROOF_EXPIRE_MINUTES: envalid.num({
    default: 1440,
    desc: `The length of time proofs as stored on the node for retrieval, in minutes`
  }),

  POST_HASHES_MAX: envalid.num({
    default: 1000,
    desc: `The maximum number of hashes accepted in a single submit request`
  }),

  POST_VERIFY_PROOFS_MAX: envalid.num({
    default: 1000,
    desc: `The maximum number of proofs accepted in a single verification request`
  }),

  GET_PROOFS_MAX: envalid.num({
    default: 250,
    desc: `The maximum number of proofs to be returned in a single request`
  }),

  CHANNEL_AMOUNT: envalid.num({
    default: 120000,
    desc: `The amount to fund a channel with`
  }),

  FUND_AMOUNT: envalid.num({
    default: 360000,
    desc: `The total wallet funding required`
  }),

  NO_LSAT_CORE_WHITELIST: validateCoreIPList({
    default: '',
    desc: 'A comma separated list of specific Core IPs to skip LSAT auth'
  })
}

module.exports = {
  env: envalid.cleanEnv(process.env, envDefinitions, { strict: false }),
  // additional functions for testing purposes
  valCoreIPList: valCoreIPList,
  valNetwork: valNetwork
}
