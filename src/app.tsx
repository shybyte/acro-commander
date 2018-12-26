import {AcrolinxEndpoint, CheckType, ReportType} from 'acrolinx-api';
import {BatchCheckerInternal, getUUID, IBatchCheckFinished, ICheckResult, openUrl} from 'acrolinx-batch-api';
import {FileCrawler} from 'acrolinx-batch-api/dist/src/crawler/file-crawler';
import {SimpleFileCrawler} from 'acrolinx-batch-api/dist/src/crawler/simple-file-crawler';
import {ICheckItem} from 'acrolinx-batch-api/src/batch-checker-internal';
import {Widgets} from 'blessed';
import fs from 'fs';
import * as _ from 'lodash';
import path from 'path';
import React, {Component} from 'react';
import {FastList} from './components/fast-list';
import {executeIfEnabled, MenuBar, MenuItem} from './components/menu-bar';
import {Config} from './config';
import './utils/global-fetch-polyfill';
import Timeout = NodeJS.Timeout;
import BoxOptions = Widgets.BoxOptions;
import FileManagerElement = Widgets.FileManagerElement;
import MessageElement = Widgets.MessageElement;
import Screen = Widgets.Screen;

interface AppProps {
  screen: Screen;
  acrolinxEndpoint: AcrolinxEndpoint;
  config: Config;
  referencePattern: string;
}

interface AppState {
  filesToCheck: ReadonlyArray<ICheckItem>;
  isWorkingTimeout?: Timeout;
  isWorkingIndex: number;
  count: number;
  menu: MenuItem[];
  aggregatedReportUrl?: string;
  message?: string;
}


export class App extends Component<AppProps, AppState> {
  batchChecker: BatchCheckerInternal;
  renderCount: number = 0;

  fileManagerRef = React.createRef<FileManagerElement>();
  checkItemListRef = React.createRef<FastList>();
  messageRef = React.createRef<MessageElement>();

  focusedElement: any;

  constructor(props: AppProps) {
    super(props);

    this.batchChecker = new BatchCheckerInternal(props.acrolinxEndpoint, props.config.accessToken);
    this.batchChecker.batchCheckEvents.addedCheckItemToFileQueue.on(this.onChangedCheckItems);
    this.batchChecker.batchCheckEvents.removedCheckItemFromFileQueue.on(this.onChangedCheckItems);
    this.batchChecker.batchCheckEvents.crawlingStarted.on(this.startWorkingIndicator);
    this.batchChecker.batchCheckEvents.crawlingDone.on(this.stopWorkingIndicator);
    this.batchChecker.batchCheckEvents.checkResult.on(this.onCheckResult);
    this.batchChecker.batchCheckEvents.done.on(this.batchCheckDone);

    this.state = {
      filesToCheck: [],
      isWorkingIndex: 0,
      count: 0,
      menu: [
        {text: 'Add', keys: ['f1'], callback: this.add, isEnabled: _.constant(true)},
        {text: 'Check', keys: ['f2'], callback: this.check, isEnabled: this.hasFilesToCheck},
        {text: 'Scorecard', keys: ['f3'], callback: this.onCheckItemAction, isEnabled: this.checkItemActionPossible},
        {
          text: 'Analysis', keys: ['f4'], callback: this.openAnalysisDashboard,
          isEnabled: () => !!this.state.aggregatedReportUrl
        },
        {text: 'Clear', keys: ['f5'], callback: this.clear, isEnabled: this.hasFilesToCheck},
        {text: 'Remove', keys: ['f6', 'delete'], callback: this.removeCheckItem, isEnabled: this.checkItemActionPossible},
        {text: 'Quit', keys: ['f10', 'escape', 'q', 'C-c'], callback: this.quit, isEnabled: _.constant(true)},
      ],
    };
  }

  hasFilesToCheck = () => this.state.filesToCheck.length > 0

  checkItemActionPossible = () =>
    this.hasFilesToCheck() && this.props.screen.focused === this.checkItemListRef.current!.focusElement

  startWorkingIndicator = () => {
    const timeout = setInterval(() => {
      this.setState({isWorkingIndex: this.state.isWorkingIndex + 1})
    }, 200);
    this.setState({isWorkingTimeout: timeout});
  }

  stopWorkingIndicator = () => {
    if (this.state.isWorkingTimeout) {
      clearInterval(this.state.isWorkingTimeout);
      this.setState({isWorkingTimeout: undefined});
    }
  }

  onChangedCheckItems = _.throttle(() => {
    const checkItems = this.batchChecker.getCheckItems();
    this.setState({
      filesToCheck: checkItems,
      count: this.state.count + 1
    });
    if (_.isEmpty(checkItems)) {
      this.fileManagerRef.current!.focus();
    }
  }, 200)

  componentDidMount(): void {
    for (const menuItem of this.state.menu) {
      this.props.screen.key(menuItem.keys, executeIfEnabled(menuItem));
    }

    this.props.screen.key(['tab'], this.changeFocus);

    setInterval(() => {
      if (this.props.screen.focused !== this.focusedElement) {
        this.focusedElement = this.props.screen.focused;
        this.forceUpdate();
      }
    }, 50);

    const fileManager = this.fileManagerRef.current!;
    fileManager.refresh();
    fileManager.focus();
  }

  add = () => {
    const fileManager = this.fileManagerRef.current!;
    let selectedFilename = (fileManager as any).value;
    let completePath = path.join(fileManager.cwd, selectedFilename);
    if (fs.statSync(completePath).isDirectory()) {
      this.batchChecker.addCrawler(new SimpleFileCrawler(completePath, true, undefined, this.props.referencePattern))
    } else {
      this.batchChecker.addCrawler(new FileCrawler(completePath))
    }
  }

  check = async () => {
    const batchId = getUUID('ac');

    this.batchChecker.checkOptions = {
      batchId: batchId,
      guidanceProfileId: this.props.config.guidanceProfile,
      disableCustomFieldValidation: true,
      checkType: CheckType.batch,
      reportTypes: [ReportType.request_text, ReportType.scorecard]
    };
    this.batchChecker.start();

    this.startWorkingIndicator();

    const {reports} = await this.props.acrolinxEndpoint.getLinkToAggregatedReport(
      this.props.config.accessToken, batchId);
    this.setState({
      aggregatedReportUrl: _.find(reports, (report) => report.reportType === 'withApiKey')!.link
    });
  }

  quit = () => {
    process.exit(0);
  }

  clear = () => {
    this.setState({filesToCheck: []});
    this.batchChecker.stop();
    this.batchChecker.resetCheckItems();
    this.fileManagerRef.current!.focus();
  }

  getCheckItemListLabel() {
    const filesToCheck = this.state.filesToCheck;
    const filesToCheckCountDisplay = filesToCheck.length ? ` (${filesToCheck.length})` : '';
    const symbols = ['|', '/', '-', '\\'];
    const workingIndicator = this.state.isWorkingTimeout ? ' ' + symbols[this.state.isWorkingIndex % symbols.length] + ' ' : '';
    return `${this.state.count} ${this.renderCount} Documents to Check${filesToCheckCountDisplay}${workingIndicator}`;
  }

  render() {
    const filesToCheck = this.state.filesToCheck;
    this.renderCount++;
    return (
      <>
        <blessed-filemanager
          ref={this.fileManagerRef} label="Select File/Folder" left="0" width="half" height="100%-1"
          keys={true}
          mouse={true}
          invertSelected={true}
          {...commonListStyle(this.props.screen.focused === (this.fileManagerRef.current && this.fileManagerRef.current))}
        >
        </blessed-filemanager>

        <FastList
          ref={this.checkItemListRef}
          screen={this.props.screen}
          label={this.getCheckItemListLabel()}
          left="50%" height="100%-1"
          {...commonListStyle(this.props.screen.focused === (this.checkItemListRef.current && this.checkItemListRef.current.focusElement))}
          items={filesToCheck.map(this.renderCheckItem)}
          onEnter={this.onCheckItemAction}
        >
        </FastList>

        <MenuBar top="100%-1" menuItems={this.state.menu} screen={this.props.screen}/>

        {this.state.message && <blessed-message
          ref={this.messageRef}
          content={this.state.message}
          top="center"
          left="center"
          width="50%"
          height="50%"
          border={{type: 'line'}}
          style={{
            bg: 'red',
            border: {bg: 'red'},
          }}
        />}

      </>
    );
  }

  private renderCheckItem = (checkItem: ICheckItem): string => {
    if ('error' in checkItem.state) {
      return '{red-fg}{white-bg}ERR{/} ' + checkItem.file
    }
    if ('acrolinxScore' in checkItem.state) {
      const {acrolinxScore, qualityStatus} = checkItem.state;
      const acrolinxScorePadded = _.padStart(acrolinxScore.toString(), 3);
      return `{${qualityStatus}-fg}${acrolinxScorePadded}{/}  ${checkItem.file}`;
    } else {
      return checkItem.file;
    }
  };

  private changeFocus = () => {
    if (this.props.screen.focused === this.fileManagerRef.current && !_.isEmpty(this.state.filesToCheck)) {
      this.checkItemListRef.current!.focus();
    } else {
      this.fileManagerRef.current!.focus();
    }
  };

  private removeCheckItem = () => {
    const selectedItem = this.state.filesToCheck[this.checkItemListRef.current!.selectedIndex];
    this.batchChecker.removeCheckItem(selectedItem.id);
  };

  private onCheckItemAction = () => {
    const selectedItem = this.state.filesToCheck[this.checkItemListRef.current!.selectedIndex];

    if ('error' in selectedItem.state) {
      this.setState({
        message: selectedItem.state.error.message
      });
      setTimeout(() => {
        this.setState({message: undefined});
      }, 1000);
      return;
    }

    if ('reports' in selectedItem.state && selectedItem.state.reports[ReportType.scorecard]) {
      openUrl(selectedItem.state.reports[ReportType.scorecard].linkAuthenticated);
    }
  };

  private openAnalysisDashboard = () => {
    if (this.state.aggregatedReportUrl) {
      openUrl(this.state.aggregatedReportUrl);
    }
  };

  private onCheckResult = (_checkResult: ICheckResult) => {
    this.onChangedCheckItems();
  };

  private batchCheckDone = (_batchCheckResult: IBatchCheckFinished) => {
    this.onChangedCheckItems();
    this.stopWorkingIndicator();
  };
}


function commonListStyle(hasFocus: boolean): BoxOptions {
  return {
    border: {type: 'line'},
    style: {
      bg: 'blue',
      border: {bg: 'blue'},
      label: {bg: 'blue'},
      selected: {bg: hasFocus ? 'cyan' : 'blue'},
    }
  }
}

