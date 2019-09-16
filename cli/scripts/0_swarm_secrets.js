/* Copyright (C) 2019 Tierion
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const lightning = require('lnrpc-node-client')
const exec = require('executive')
const chalk = require('chalk')
const generator = require('generate-password')
const homedir = require('os').homedir()
const { updateOrCreateEnv } = require('../utils/updateEnv')

lightning.setTls('127.0.0.1:10009', `${homedir}/.lnd/tls.cert`)
let unlocker = lightning.unlocker()
lightning.promisifyGrpc(unlocker)

let pass = generator.generate({
  length: 20,
  numbers: false
})

async function createSwarmAndSecrets(lndOpts) {
  try {
    let seed = await unlocker.genSeedAsync({})
    console.log(seed)
    let init = await unlocker.initWalletAsync({
      wallet_password: pass,
      cipher_seed_mnemonic: seed.value.cipher_seed_mnemonic
    })
    console.log(init)

    await new Promise(resolve => {
      setTimeout(() => {
        resolve()
      }, 7000)
    })

    lightning.setCredentials(
      '127.0.0.1:10009',
      `${homedir}/.lnd/data/chain/bitcoin/testnet/admin.macaroon`,
      `${homedir}/.lnd/tls.cert`
    )
    let client = lightning.lightning()
    lightning.promisifyGrpc(client)
    let address = await client.newAddressAsync({ type: 0 }, (err, res) => {
      console.log(res)
      console.log(err)
    })
    console.log(address)

    // Create Docker secrets
    try {
      await exec.quiet([
        `printf ${pass} | docker secret create HOT_WALLET_PASS -`,
        `printf ${seed.value.cipher_seed_mnemonic.join(' ')} | docker secret create HOT_WALLET_SEED -`,
        `printf ${address.value.address} | docker secret create HOT_WALLET_ADDRESS -`
      ])
    } catch (err) {
      console.log(chalk.red(`Could not exec docker secret creation: ${err}`))
    }

    let { lndTLSCert, lndMacaroon } = await exec.parallel({
      lndTLSCert: `base64 ${homedir}/.lnd/tls.cert`,
      lndMacaroon: `base64 ${homedir}/.lnd/data/chain/bitcoin/${lndOpts.NETWORK}/admin.macaroon`
    })

    return updateOrCreateEnv([], {
      NETWORK: lndOpts.NETWORK,
      NODE_PUBLIC_IP_ADDRESS: `http://${lndOpts.NODE_PUBLIC_IP_ADDRESS}`,
      LND_TLS_CERT: lndTLSCert.stdout ? lndTLSCert.stdout.trim().replace('\n', '') : '',
      LND_MACAROON: lndMacaroon.stdout ? lndMacaroon.stdout.trim().replace('\n', '') : ''
    })
  } catch (error) {
    console.log(error)
  }
}

module.exports = createSwarmAndSecrets
