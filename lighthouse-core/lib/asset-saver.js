/**
 * @license
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const fs = require('fs');
const log = require('../../lighthouse-core/lib/log.js');
const stringifySafe = require('json-stringify-safe');
const Metrics = require('./traces/pwmetrics-events');
const getFilenamePrefix = require('./file-namer.js').getFilenamePrefix;

/**
 * Generate basic HTML page of screenshot filmstrip
 * @param {!Array<{timestamp: number, datauri: string}>} screenshots
 * @param {!Results} results
 * @return {!string}
 */
function screenshotDump(screenshots, results) {
  return `
  <!doctype html>
  <title>screenshots ${getFilenamePrefix(results)}</title>
  <style>
html {
    overflow-x: scroll;
    overflow-y: hidden;
    height: 100%;
    background: linear-gradient(to left, #4CA1AF , #C4E0E5);
    background-attachment: fixed;
    padding: 10px;
}
body {
    white-space: nowrap;
    background: linear-gradient(to left, #4CA1AF , #C4E0E5);
    width: 100%;
    margin: 0;
}
img {
    margin: 4px;
}
</style>
  <body>
    <script>
      var shots = ${JSON.stringify(screenshots)};

  shots.forEach(s => {
    var i = document.createElement('img');
    i.src = s.datauri;
    i.title = s.timestamp;
    document.body.appendChild(i);
  });
  </script>
  `;
}

/**
 * Save entire artifacts object to a single stringified file
 * @param {!Artifacts} artifacts
 * @param {!string} artifactsFilename
 */
// Set to ignore because testing it would imply testing fs, which isn't strictly necessary.
/* istanbul ignore next */
function saveArtifacts(artifacts, artifactsFilename) {
  artifactsFilename = artifactsFilename || 'artifacts.log';
  // The networkRecords artifacts have circular references
  fs.writeFileSync(artifactsFilename, stringifySafe(artifacts));
  log.log('artifacts file saved to disk', artifactsFilename);
}

/**
 * Filter traces and extract screenshots to prepare for saving.
 * @param {!Artifacts} artifacts
 * @param {!Results} results
 * @return {!Promise<!Array<{traceData: !Object, html: string}>>}
 */
function prepareAssets(artifacts, results) {
  const passNames = Object.keys(artifacts.traces);
  const assets = [];

  return passNames.reduce((chain, passName) => {
    const trace = artifacts.traces[passName];

    return chain.then(_ => artifacts.requestScreenshots(trace))
      .then(screenshots => {
        const traceData = Object.assign({}, trace);
        const html = screenshotDump(screenshots, results);

        if (results && results.audits) {
          const evts = new Metrics(traceData.traceEvents, results.audits).generateFakeEvents();
          traceData.traceEvents.push(...evts);
        }
        assets.push({
          traceData,
          html
        });
      });
  }, Promise.resolve())
    .then(_ => assets);
}

/**
 * Writes trace(s) and associated screenshot(s) to disk.
 * @param {!Artifacts} artifacts
 * @param {!Results} results
 * @return {!Promise}
 */
function saveAssets(artifacts, results) {
  return prepareAssets(artifacts, results).then(assets => {
    assets.forEach((data, index) => {
      const filenamePrefix = getFilenamePrefix(results);
      const traceData = data.traceData;
      fs.writeFileSync(`${filenamePrefix}-${index}.trace.json`, JSON.stringify(traceData, null, 2));
      log.log('trace file saved to disk', filenamePrefix);

      fs.writeFileSync(`${filenamePrefix}-${index}.screenshots.html`, data.html);
      log.log('screenshots saved to disk', filenamePrefix);
    });
  });
}

module.exports = {
  saveArtifacts,
  saveAssets,
  getFilenamePrefix,
  prepareAssets
};
