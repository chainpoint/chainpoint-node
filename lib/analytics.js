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

// load environment variables
let env = require('./parse-env.js').env
let ua = require('universal-analytics')
const logger = require('./logger.js')

let visitor
if (env.GOOGLE_UA_ID) {
  visitor = ua(env.GOOGLE_UA_ID, env.PUBLIC_IP, { strictCidFormat: false })
  logger.info(`Setup analytics for analytics id ${env.GOOGLE_UA_ID}`)
}

function setClientID(clientID) {
  if (env.GOOGLE_UA_ID) {
    visitor = ua(env.GOOGLE_UA_ID, clientID, { strictCidFormat: false })
  }
}

function sendEvent(params) {
  if (params && visitor) {
    logger.info(`Sending event ${params.ea}`)
    visitor.event(params).send()
  }
}

module.exports = {
  setClientID: setClientID,
  sendEvent: sendEvent
}
