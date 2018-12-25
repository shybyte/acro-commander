import {AcrolinxEndpoint, AcrolinxEndpointProps, CheckType, DEVELOPMENT_SIGNATURE, ReportType} from 'acrolinx-api';
import {BatchCheckerInternal, getUUID, ICheckResult} from 'acrolinx-batch-api';
import {FileCrawler} from 'acrolinx-batch-api/dist/src/crawler/file-crawler';
import {SimpleFileCrawler} from 'acrolinx-batch-api/dist/src/crawler/simple-file-crawler';
import {ICheckItem} from 'acrolinx-batch-api/src/batch-checker-internal';
import path from 'path';
import fs from 'fs';
import React, {Component} from 'react';
import blessed, {Widgets} from 'blessed';
import {render} from 'react-blessed';
import Screen = Widgets.Screen;
import FileManagerElement = Widgets.FileManagerElement;
import './utils/global-fetch-polyfill';
import Timeout = NodeJS.Timeout;
import * as _ from 'lodash';
import {FastList} from './components/fast-list';
import {MenuBar, MenuItem} from './components/menu-bar';
import BoxElement = Widgets.BoxElement;
import BoxOptions = Widgets.BoxOptions;
import opn from 'opn';

interface AppProps {
  screen: Screen;
  acrolinxEndpoint: AcrolinxEndpoint;
  accessToken: string;
  referencePattern: string;
}

interface AppState {
  filesToCheck: ReadonlyArray<ICheckItem>;
  isWorkingTimeout?: Timeout;
  isWorkingIndex: number;
  count: number;
  menu: MenuItem[];
}


export class App extends Component<AppProps, AppState> {
  batchChecker: BatchCheckerInternal;
  renderCount: number = 0;
  fileManagerRef = React.createRef<FileManagerElement>();
  checkItemListRef = React.createRef<FastList>();
  boxRef = React.createRef<BoxElement>();
  focusedElement: any;

  constructor(props: AppProps) {
    super(props);

    this.batchChecker = new BatchCheckerInternal(props.acrolinxEndpoint, props.accessToken);
    this.batchChecker.batchCheckEvents.addedCheckItemToFileQueue.on(this.onChangedCheckItems);
    this.batchChecker.batchCheckEvents.removedCheckItemFromFileQueue.on(this.onChangedCheckItems);
    this.batchChecker.batchCheckEvents.crawlingStarted.on(this.startWorkingIndicator);
    this.batchChecker.batchCheckEvents.crawlingDone.on(this.stopWorkingIndicator);
    this.batchChecker.batchCheckEvents.checkResult.on(this.onCheckResult);

    this.state = {
      filesToCheck: [],
      isWorkingIndex: 0,
      count: 0,
      menu: [
        {text: 'Add', keys: ['f1'], callback: this.add, isEnabled: _.constant(true)},
        {text: 'Check', keys: ['f2'], callback: this.check, isEnabled: this.hasFilesToCheck},
        {text: 'Scorecard', keys: ['f3'], callback: this.openScoreCard, isEnabled: this.canRemove},
        {text: 'Clear', keys: ['f4'], callback: this.clear, isEnabled: this.hasFilesToCheck},
        {text: 'Remove', keys: ['f5'], callback: this.removeCheckItem, isEnabled: this.canRemove},
        {text: 'Quit', keys: ['f10', 'escape', 'q', 'C-c'], callback: this.quit, isEnabled: _.constant(true)},
      ]
    };
  }

  hasFilesToCheck = () => this.state.filesToCheck.length > 0

  canRemove = () => this.hasFilesToCheck() && this.props.screen.focused === this.checkItemListRef.current!.focusElement

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
      this.props.screen.key(menuItem.keys, menuItem.callback);
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

  check = () => {
    this.batchChecker.checkOptions = {
      batchId: getUUID('ac'),
      // guidanceProfileId: this.state.selectedGuidanceProfileId,
      disableCustomFieldValidation: true,
      checkType: CheckType.batch,
      reportTypes: [ReportType.request_text, ReportType.scorecard]
    };
    this.batchChecker.start();
  };

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
          {...commonListStyle(this.props.screen.focused === (this.fileManagerRef.current && this.fileManagerRef.current) )}
        >
        </blessed-filemanager>

        <FastList
          ref={this.checkItemListRef}
          screen={this.props.screen}
          label={this.getCheckItemListLabel()}
          left="50%" height="100%-1"
          {...commonListStyle(this.props.screen.focused === (this.checkItemListRef.current && this.checkItemListRef.current.focusElement) )}
          items={filesToCheck.map(this.renderCheckItem)}
        >
        </FastList>

        <MenuBar top="100%-1" menuItems={this.state.menu} screen={this.props.screen}/>

      </>
    );
  }

  private renderCheckItem = (checkItem: ICheckItem): string => {
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

  private openScoreCard = () => {
    const selectedItem = this.state.filesToCheck[this.checkItemListRef.current!.selectedIndex];
    if ('reports' in selectedItem.state && selectedItem.state.reports[ReportType.scorecard]) {
      opn(selectedItem.state.reports[ReportType.scorecard].linkAuthenticated);
    }
  };

  private onCheckResult = (_checkResult: ICheckResult) => {
    // console.log('onCheckResult', JSON.stringify(checkResult, null , 2));
    this.onChangedCheckItems();
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

