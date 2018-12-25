import {AcrolinxEndpoint, AcrolinxEndpointProps, DEVELOPMENT_SIGNATURE} from 'acrolinx-api';
import blessed, {Widgets} from 'blessed';
import React from 'react';
import {render} from 'react-blessed';
import {App} from './app';
import os from 'os';
import path from 'path';
import fs from 'fs';
import './utils/global-fetch-polyfill';
import {readConfig} from './config';

const APP_NAME = 'AcroCommander';

export const EXAMPLE_ACROLINX_ENDPOINT_PROPS: AcrolinxEndpointProps = {
  client: {
    name: APP_NAME,
    signature: DEVELOPMENT_SIGNATURE,
    version: '1.2.3.666'
  },
  serverAddress: 'http://localhost:8031'
};

async function startApp() {
  const config = readConfig();

  const acrolinxEndpoint = new AcrolinxEndpoint({
    ...EXAMPLE_ACROLINX_ENDPOINT_PROPS,
    serverAddress: config.serverAddress
  });

  const capabilities = await acrolinxEndpoint.getCheckingCapabilities(config.accessToken);
  // console.log(JSON.stringify(capabilities, null, 2));
  // console.log(capabilities.referencePattern);

  const screen: Widgets.Screen = blessed.screen({
    autoPadding: true,
    smartCSR: true,
    title: APP_NAME
  });

  const component = render(<App
    screen={screen}
    acrolinxEndpoint={acrolinxEndpoint}
    config={config}
    referencePattern={capabilities.referencePattern}
  />, screen);

}

startApp().catch((error) => {
  console.error(error);
});

