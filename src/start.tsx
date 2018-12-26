import {AcrolinxEndpoint, AcrolinxEndpointProps, DEVELOPMENT_SIGNATURE} from 'acrolinx-api';
import blessed, {Widgets} from 'blessed';
import React from 'react';
import {render} from 'react-blessed';
import {App} from './app';
import {readConfig} from './config';
import './utils/global-fetch-polyfill';

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

  const screen: Widgets.Screen = blessed.screen({
    autoPadding: true,
    smartCSR: true,
    title: APP_NAME
  });

  render(<App
    screen={screen}
    acrolinxEndpoint={acrolinxEndpoint}
    config={config}
    referencePattern={capabilities.referencePattern}
  />, screen);
}

startApp().catch((error) => {
  // tslint:disable:next-line: no-console
  console.error(error);
});

