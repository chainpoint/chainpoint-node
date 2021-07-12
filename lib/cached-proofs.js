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

let cores = require('./cores.js')
const utils = require('./utils.js')
const _ = require('lodash')
const logger = require('./logger.js')
let env = require('./parse-env.js').env

// The object containing the cached Core proof objects
let CORE_PROOF_CACHE = {}

const PRUNE_EXPIRED_INTERVAL_SECONDS = 10

async function getCachedCoreProofsAsync(coreSubmissions) {
  // determine max core submission count for these submissions... the largest cores array of all submissions
  // this will be constant under normal usage, only varying if the master submission count is updated
  let maxCoreSubmissionCount = coreSubmissions.reduce((result, item) => {
    if (item.cores.length > result) result = item.cores.length
    return result
  }, 0)

  // create `proofId` to `submitId` lookup object, keyed by `proofId`
  // and simultaneously create `coreSubmissionsLookup` object keyed by the coreSubmissions `submitId`
  let [submitIdForHashIdCoreLookup, coreSubmissionsLookup] = coreSubmissions.reduce(
    (result, item) => {
      for (let core of item.cores) {
        result[0][core.proofId] = item.submitId
      }
      result[1][item.submitId] = { cores: item.cores, proof: undefined }
      return [result[0], result[1]]
    },
    [{}, {}]
  )

  // Attempt to read proofs from the cache.
  // For all proofs that are not found (not cached), keep `proof` value as undefined
  for (let submitId in coreSubmissionsLookup) {
    coreSubmissionsLookup[submitId].proof = (function() {
      if (CORE_PROOF_CACHE[submitId] && _.isNil(CORE_PROOF_CACHE[submitId].coreProof)) return null

      return CORE_PROOF_CACHE[submitId] ? _.get(CORE_PROOF_CACHE, `${submitId}.coreProof`, undefined) : undefined
    })()
  }

  // loop through the 1st, 2nd, ... cores array object for each submission until all proofs have been returned
  // under normal operation, with all Cores operating as expected, only one iteration will be performed
  // if a Core is offline, the second iterations will attempt to request proofs from the second IP/HashIdCore pair
  // iterations will continue until all values have been retrieved, or all IP/HashIdCore pairs have been attempted
  //
  // use `newProofSubmitIds` to keep track of the submitIds that have new proof data returned from Core
  // this information is used later to determine what new data needs to be cached
  let newProofSubmitIds = []
  for (let index = 0; index < maxCoreSubmissionCount; index++) {
    // find core submissions that have `undefined` proofs, they will be requested from Core at cores index `index`
    let undefinedProofSubmissions = Object.keys(coreSubmissionsLookup).reduce((result, submitId) => {
      let coreInfo = coreSubmissionsLookup[submitId].cores[index]
      // if the proof is undefined, and Core info exists in this submission for this `index`, add to results
      if (coreSubmissionsLookup[submitId].proof === undefined && coreInfo) {
        result.push({ submitId: submitId, ip: coreInfo.ip, proofId: coreInfo.proofId })
      } else if (
        coreSubmissionsLookup[submitId].proof !== undefined &&
        coreSubmissionsLookup[submitId].proof != null &&
        coreSubmissionsLookup[submitId].proof.hash_received !== undefined &&
        coreInfo
      ) {
        let timer = Date.parse(coreSubmissionsLookup[submitId].proof.hash_received)
        let btcDue = Date.now() - timer > 7200000 // 120 min have passed
        // if 90 minutes have passed and we have a cal anchor and not a btc anchor
        // then we add the proof to undefinedProofSubmissions to ensure re-retrieval
        if (
          btcDue &&
          (coreSubmissionsLookup[submitId].anchorsComplete !== undefined &&
            (!coreSubmissionsLookup[submitId].anchorsComplete.includes('btc') ||
              !coreSubmissionsLookup[submitId].anchorsComplete.includes('tbtc')))
        ) {
          logger.info(`time to check for btc proof ${coreInfo.proofId} from ${coreInfo.ip}`)
          result.push({ submitId: submitId, ip: coreInfo.ip, proofId: coreInfo.proofId })
        }
      }
      return result
    }, [])

    // if none were found, then we have received proof data for all requested submissions, exit loop
    if (undefinedProofSubmissions.length === 0) break

    // split `undefinedProofSubmissions` into distinct array by unique Core IP
    // this is needed so that we may request proofs from Core in batches grouped by Core IP
    // start by determining all the unique IPs in play in undefinedProofSubmissions
    let uniqueIPs = undefinedProofSubmissions.reduce((result, item) => {
      // using unshift to build list in reverse for efficiency because we must iterate in reverse later
      if (!result.includes(item.ip)) result.unshift(item.ip)
      return result
    }, [])

    // build an array of submissions for each unique Core IP found
    let submissionsGroupByIPs = []
    for (let ip of uniqueIPs) {
      let result = []
      for (let x = undefinedProofSubmissions.length - 1; x >= 0; x--) {
        if (undefinedProofSubmissions[x].ip === ip) result.push(...undefinedProofSubmissions.splice(x, 1))
      }
      submissionsGroupByIPs.push(result)
    }

    // for each resulting submission group array, request the proofs from Core
    for (let submissionsGroup of submissionsGroupByIPs) {
      // flatten the submission data for use in the getProofsAsync call
      let flattenedSubmission = submissionsGroup.reduce(
        (result, item) => {
          result.ip = item.ip // need to make the setting only once, but will be the same for every item
          result.proofIds.push(item.proofId)
          return result
        },
        { ip: '', proofIds: [] }
      )

      // attempt to retrieve proofs from Core
      let getProofsFromCoreResults = []
      try {
        getProofsFromCoreResults = await cores.getProofsAsync(flattenedSubmission.ip, flattenedSubmission.proofIds)
      } catch (err) {
        logger.error(
          `getCachedCoreProofsAsync : Core ${flattenedSubmission.ip} : ProofID Count ${
            flattenedSubmission.proofIds.length
          } (${JSON.stringify(flattenedSubmission.proofIds)}) : ${err.message}`
        )
        // Cache as `null` Proof to prevent subsequent retries for 1min
        CORE_PROOF_CACHE[submissionsGroup.submitId] = {
          coreProof: null,
          expiresAt: Date.now() + 1 * 60 * 1000 // 1min
        }
      }

      // assign the returned proof values back to the `coreSubmissions` object,
      // for each item in the results, using the `submitIdForHashIdCoreLookup` object
      for (let result of getProofsFromCoreResults) {
        let submitIdForResult = submitIdForHashIdCoreLookup[result.proof_id]
        // be sure that the `submitIdForResult` is known in `coreSubmissions`
        // assuming it is, as it always should be unless error, assign the proof to that key
        if (coreSubmissionsLookup.hasOwnProperty(submitIdForResult)) {
          coreSubmissionsLookup[submitIdForResult].proof = result.proof
          coreSubmissionsLookup[submitIdForResult].anchorsComplete = _.isNil(
            coreSubmissionsLookup[submitIdForResult].proof
          )
            ? []
            : utils.parseAnchorsComplete(coreSubmissionsLookup[submitIdForResult].proof, env.NETWORK)
          // track this submitId for caching later
          newProofSubmitIds.push(submitIdForResult)
        }
      }
    }
  }

  // cache any new results returned from Core
  if (newProofSubmitIds.length > 0) {
    // for all new proofs received from Core, create an proofType lookup object for use in determining
    // proper cache TTL for the proof
    let proofTypeLookup = newProofSubmitIds.reduce((result, submitId) => {
      if (!_.isNil(coreSubmissionsLookup[submitId].proof)) {
        if (env.NETWORK === 'mainnet') {
          result[submitId] = coreSubmissionsLookup[submitId].anchorsComplete.includes('btc') ? 'btc' : 'cal'
        } else {
          result[submitId] = coreSubmissionsLookup[submitId].anchorsComplete.includes('tbtc') ? 'tbtc' : 'tcal'
        }
      }
      return result
    }, {})

    // Store the non-null AND null proofs from Core in the local cache for subsequent requests
    // First, create the array of objects to be written to the cache
    let uncachedCoreProofObjects = newProofSubmitIds.reduce((result, submitId) => {
      // `null` cached proofs expire after 1 minute
      // `(t)cal` cached proofs expire after 15 minutes
      // `(t)btc` cached proofs expire after 25 hours
      let expMinutes = 1
      if (coreSubmissionsLookup[submitId].proof !== null) {
        expMinutes = ['btc', 'tbtc'].includes(proofTypeLookup[submitId]) ? 25 * 60 : 15
      }
      result.push({
        submitId: submitId,
        coreProof: coreSubmissionsLookup[submitId].proof,
        expiresAt: Date.now() + expMinutes * 60 * 1000
      })
      return result
    }, [])

    // Next,write proofs to cache
    for (let coreProofObject of uncachedCoreProofObjects) {
      CORE_PROOF_CACHE[coreProofObject.submitId] = {
        coreProof: coreProofObject.coreProof,
        expiresAt: coreProofObject.expiresAt
      }
    }
  }

  // format `coreSubmissions` into the proper result object to return from this function
  let finalProofResults = Object.keys(coreSubmissionsLookup).map(submitId => {
    if (_.isNil(coreSubmissionsLookup[submitId].proof)) {
      return { submitId: submitId, proof: null }
    }
    // A proof exists and has been found for this submitId
    // Identify the anchors completed in this proof and append that information
    return {
      submitId: submitId,
      proof: coreSubmissionsLookup[submitId].proof,
      anchorsComplete: coreSubmissionsLookup[submitId].anchorsComplete
    }
  })

  // Finally, return the proof items array
  return finalProofResults
}

function pruneExpiredItems() {
  let now = Date.now()
  for (let key in CORE_PROOF_CACHE) {
    if (CORE_PROOF_CACHE[key].expiresAt <= now) {
      delete CORE_PROOF_CACHE[key]
    }
  }
}

function startPruneExpiredItemsInterval() {
  return setInterval(pruneExpiredItems, PRUNE_EXPIRED_INTERVAL_SECONDS * 1000)
}

module.exports = {
  getCachedCoreProofsAsync: getCachedCoreProofsAsync,
  startPruneExpiredItemsInterval: startPruneExpiredItemsInterval,
  // additional functions for testing purposes
  pruneExpiredItems: pruneExpiredItems,
  getPruneExpiredIntervalSeconds: () => PRUNE_EXPIRED_INTERVAL_SECONDS,
  getCoreProofCache: () => CORE_PROOF_CACHE,
  setCoreProofCache: obj => {
    CORE_PROOF_CACHE = obj
  },
  setCores: c => {
    cores = c
  },
  setENV: obj => {
    env = obj
  }
}
