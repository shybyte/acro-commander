import fs from 'fs';
import os from 'os';
import path from 'path';

export interface Config {
  serverAddress: string;
  accessToken: string;
  guidanceProfile?: string;
}

const configFile = path.join(os.homedir(), '.config', 'acro-commander.config.json');

export function readConfig(): Config {
  const configFileContent = fs.readFileSync(configFile, 'utf8');
  const config: Config = JSON.parse(configFileContent);

  if (!config.accessToken) {
    throw new Error('Missing "accessToken" in config file.');
  }

  if (!config.serverAddress) {
    throw new Error('Missing "serverAddress" in config file.');
  }

  return config;
}
