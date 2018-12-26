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
import {ImprovedFileManagerElement} from './typings/blessed-improved';
import './utils/global-fetch-polyfill';
import Timeout = NodeJS.Timeout;
import BlessedElement = Widgets.BlessedElement;
import BoxOptions = Widgets.BoxOptions;
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
  menu: MenuItem[];
  aggregatedReportUrl?: string;
  message?: string;
}


export class App extends Component<AppProps, AppState> {
  batchChecker: BatchCheckerInternal;
  renderCount: number = 0;

  fileManagerRef = React.createRef<ImprovedFileManagerElement>();
  checkItemListRef = React.createRef<FastList<ICheckItem>>();
  messageRef = React.createRef<MessageElement>();

  lastFocusedElement?: BlessedElement;

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
      menu: [
        {text: 'Add', keys: ['f1'], callback: this.add, isEnabled: this.isFileManagerFocused},
        {text: 'Check', keys: ['f2'], callback: this.check, isEnabled: this.hasFilesToCheck},
        {text: 'Scorecard', keys: ['f3'], callback: this.onCheckItemAction, isEnabled: this.checkItemActionPossible},
        {
          text: 'Analysis', keys: ['f4'], callback: this.openAnalysisDashboard,
          isEnabled: () => !!this.state.aggregatedReportUrl
        },
        {text: 'Clear', keys: ['f5'], callback: this.clear, isEnabled: this.hasFilesToCheck},
        {
          text: 'Remove',
          keys: ['f6', 'delete'],
          callback: this.removeCheckItem,
          isEnabled: this.checkItemActionPossible
        },
        {text: 'Stop', keys: ['f7'], callback: this.stop, isEnabled: this.isWorking},
        {text: 'Quit', keys: ['f10', 'escape', 'q', 'C-c'], callback: this.quit, isEnabled: _.constant(true)},
      ],
    };
  }

  get fileManager() {
    return this.fileManagerRef.current!;
  }

  get checkItemList() {
    return this.checkItemListRef.current!;
  }

  isWorking = () => !!this.state.isWorkingTimeout;
  hasFilesToCheck = () => this.state.filesToCheck.length > 0;
  isFileManagerFocused = () => this.isFocused(this.fileManager);
  isCheckItemListFocused = () => this.checkItemList && this.isFocused(this.checkItemList.focusElement);
  checkItemActionPossible = () => this.hasFilesToCheck() && this.isCheckItemListFocused();

  startWorkingIndicator = () => {
    const timeout = setInterval(() => {
      this.setState({isWorkingIndex: this.state.isWorkingIndex + 1});
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
    this.setState({filesToCheck: checkItems});
    if (_.isEmpty(checkItems)) {
      this.fileManager.focus();
    }
  }, 200);

  componentDidMount(): void {
    for (const menuItem of this.state.menu) {
      this.props.screen.key(menuItem.keys, executeIfEnabled(menuItem));
    }

    this.props.screen.key(['tab'], this.changeFocus);

    setInterval(() => {
      if (this.props.screen.focused !== this.lastFocusedElement) {
        this.lastFocusedElement = this.props.screen.focused;
        this.forceUpdate();
      }
    }, 50);

    this.fileManager.refresh();
    this.fileManager.focus();
  }

  onCd = () => {
    setTimeout(() => {
      this.forceUpdate();
    }, 10);
  };

  add = () => {
    const fileManager = this.fileManager;
    const selectedFilename = fileManager.value;
    const completePath = path.join(fileManager.cwd, selectedFilename);
    if (fs.statSync(completePath).isDirectory()) {
      this.batchChecker.addCrawler(
        new SimpleFileCrawler(completePath, true, undefined, this.props.referencePattern)
      ).catch(this.onError);
    } else {
      this.onFileManagerFileAction(completePath);
    }
  }

  onError = (error: Error) => {
    this.showMessage(error.message);
  }

  check = async () => {
    const batchId = getUUID('ac');
    this.batchChecker.selectAllCheckItems();

    this.batchChecker.checkOptions = {
      batchId,
      guidanceProfileId: this.props.config.guidanceProfile,
      disableCustomFieldValidation: true,
      checkType: CheckType.batch,
      reportTypes: [ReportType.request_text, ReportType.scorecard]
    };
    this.batchChecker.start().catch(this.onError);

    this.startWorkingIndicator();

    const {reports} = await this.props.acrolinxEndpoint.getLinkToAggregatedReport(
      this.props.config.accessToken, batchId);
    this.setState({
      aggregatedReportUrl: _.find(reports, (report) => report.reportType === 'withApiKey')!.link
    });
  }

  stop = () => {
    this.batchChecker.stop();
  };

  quit = () => {
    process.exit(0);
  }

  clear = () => {
    this.setState({filesToCheck: []});
    this.batchChecker.stop();
    this.batchChecker.resetCheckItems();
    this.fileManager.focus();
  }

  getCheckProgressDisplayString() {
    const filesToCheck = this.state.filesToCheck;
    if (!filesToCheck.length) {
      return '';
    }

    const successfulCheckedCount = _.chain(filesToCheck).filter(({state}) => 'acrolinxScore' in state).size().value();
    const failedCheckedCount = _.chain(filesToCheck).filter(({state}) => 'error' in state).size().value();
    const checkedCount = successfulCheckedCount + failedCheckedCount;

    if (!this.batchChecker.isRunning() && !checkedCount) {
      return ` (${filesToCheck.length})`;
    }

    return ` (${checkedCount}/${filesToCheck.length})` + (failedCheckedCount ? ` Failed ${failedCheckedCount}` : '');
  }

  getWorkingIndicator() {
    const rotatingAnimationFrames = ['|', '/', '-', '\\'];
    const animationFrame = rotatingAnimationFrames[this.state.isWorkingIndex % rotatingAnimationFrames.length];
    return this.state.isWorkingTimeout ? ` ${animationFrame} ` : '';
  }

  getCheckItemListLabel() {
    return ['Documents to Check', this.getCheckProgressDisplayString(), this.getWorkingIndicator()].join('');
  }

  private onFileManagerFileAction = (file: string) => {
    if (new RegExp(this.props.referencePattern).test(file)) {
      this.batchChecker.addCrawler(
        new FileCrawler(file, undefined, this.props.referencePattern)
      ).catch(this.onError);
    } else {
      this.showMessage('We can\'t check this file.');
    }
  }

  render() {
    const filesToCheck = this.state.filesToCheck;
    this.renderCount++;
    return (
      <>
        <blessed-filemanager
          ref={this.fileManagerRef} label='Select File/Folder' left='0' width='half' height='100%-1'
          keys={true}
          mouse={true}
          invertSelected={true}
          onFile={this.onFileManagerFileAction}
          onCd={this.onCd}
          {...commonListStyle(this.isFileManagerFocused())}
        >
        </blessed-filemanager>

        <FastList
          ref={this.checkItemListRef}
          screen={this.props.screen}
          label={this.getCheckItemListLabel()}
          left='50%' height='100%-1'
          {...commonListStyle(this.isCheckItemListFocused())}
          items={filesToCheck}
          renderItem={this.renderCheckItem}
          onEnter={this.onCheckItemAction}
        >
        </FastList>

        <MenuBar top='100%-1' menuItems={this.state.menu} screen={this.props.screen}/>

        {this.state.message && <blessed-message
          ref={this.messageRef}
          content={this.state.message}
          top='center'
          left='center'
          width='50%'
          height='50%'
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
    const file = checkItem.file.replace(new RegExp(`^${this.fileManager.cwd}/`), '');

    if ('error' in checkItem.state) {
      return '{red-fg}{white-bg}ERR{/} ' + file;
    }

    if ('acrolinxScore' in checkItem.state) {
      const {acrolinxScore, qualityStatus} = checkItem.state;
      const acrolinxScorePadded = _.padStart(acrolinxScore.toString(), 3);
      return `{${qualityStatus}-fg}${acrolinxScorePadded}{/}  ${file}`;
    }

    return file;
  };


  private changeFocus = () => {
    if (this.isFocused(this.fileManager) && this.hasFilesToCheck) {
      this.checkItemList.focus();
    } else {
      this.fileManager.focus();
    }
  };

  isFocused = (el: BlessedElement) => this.props.screen.focused === el;

  private removeCheckItem = () => {
    const selectedItem = this.getSelectedCheckItem();
    this.batchChecker.removeCheckItem(selectedItem.id);
  };

  private getSelectedCheckItem = () => this.state.filesToCheck[this.checkItemListRef.current!.selectedIndex];

  private onCheckItemAction = () => {
    const selectedItem = this.getSelectedCheckItem();

    if ('error' in selectedItem.state) {
      this.showMessage(selectedItem.state.error.message);
      return;
    }

    if ('reports' in selectedItem.state && selectedItem.state.reports[ReportType.scorecard]) {
      openUrl(selectedItem.state.reports[ReportType.scorecard].linkAuthenticated);
      return;
    } else {
      this.showMessage('No scorecard available yet. Please check!');
    }

  };

  private showMessage(message: string) {
    this.setState({
      message
    });
    setTimeout(() => {
      this.setState({message: undefined});
    }, 1000);
  }

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
  };
}

